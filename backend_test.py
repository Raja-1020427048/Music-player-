#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Music Player Application
Tests all endpoints including file upload, streaming, favorites, stats, and playlists
"""

import requests
import sys
import json
import io
import os
from datetime import datetime
from pathlib import Path

class MusicPlayerAPITester:
    def __init__(self, base_url="https://e7589f17-c40e-4ca9-9b65-8b6e573a1867.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.uploaded_song_id = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def test_health_check(self):
        """Test the root health check endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Response: {data}"
            return self.log_test("Health Check", success, details)
        except Exception as e:
            return self.log_test("Health Check", False, f"Error: {str(e)}")

    def test_get_songs_empty(self):
        """Test getting songs when library is empty"""
        try:
            response = requests.get(f"{self.api_url}/songs", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            details = f"Status: {response.status_code}, Songs count: {len(data)}"
            return self.log_test("Get Songs (Empty)", success, details)
        except Exception as e:
            return self.log_test("Get Songs (Empty)", False, f"Error: {str(e)}")

    def test_get_stats_empty(self):
        """Test getting stats when library is empty"""
        try:
            response = requests.get(f"{self.api_url}/stats", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Stats: {data}"
            return self.log_test("Get Stats (Empty)", success, details)
        except Exception as e:
            return self.log_test("Get Stats (Empty)", False, f"Error: {str(e)}")

    def create_test_audio_file(self):
        """Create a simple test audio file (WAV format)"""
        # Create a minimal WAV file header for testing
        wav_header = b'RIFF\x24\x08\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x08\x00\x00'
        # Add some dummy audio data
        audio_data = b'\x00\x00' * 1000  # 1000 samples of silence
        return wav_header + audio_data

    def test_upload_song(self):
        """Test uploading a music file"""
        try:
            # Create test audio file
            audio_data = self.create_test_audio_file()
            
            files = {
                'file': ('test_song.wav', io.BytesIO(audio_data), 'audio/wav')
            }
            
            response = requests.post(f"{self.api_url}/songs/upload", files=files, timeout=30)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.uploaded_song_id = data.get('id')
                details = f"Status: {response.status_code}, Song ID: {self.uploaded_song_id}, Title: {data.get('title')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text}"
            
            return self.log_test("Upload Song", success, details)
        except Exception as e:
            return self.log_test("Upload Song", False, f"Error: {str(e)}")

    def test_upload_invalid_file(self):
        """Test uploading a non-audio file (should fail)"""
        try:
            files = {
                'file': ('test.txt', io.BytesIO(b'This is not an audio file'), 'text/plain')
            }
            
            response = requests.post(f"{self.api_url}/songs/upload", files=files, timeout=10)
            success = response.status_code == 400  # Should fail with 400
            details = f"Status: {response.status_code} (Expected 400)"
            return self.log_test("Upload Invalid File", success, details)
        except Exception as e:
            return self.log_test("Upload Invalid File", False, f"Error: {str(e)}")

    def test_get_songs_with_data(self):
        """Test getting songs after upload"""
        try:
            response = requests.get(f"{self.api_url}/songs", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            details = f"Status: {response.status_code}, Songs count: {len(data)}"
            return self.log_test("Get Songs (With Data)", success, details)
        except Exception as e:
            return self.log_test("Get Songs (With Data)", False, f"Error: {str(e)}")

    def test_get_specific_song(self):
        """Test getting a specific song by ID"""
        if not self.uploaded_song_id:
            return self.log_test("Get Specific Song", False, "No uploaded song ID available")
        
        try:
            response = requests.get(f"{self.api_url}/songs/{self.uploaded_song_id}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Song: {data.get('title', 'N/A')}"
            return self.log_test("Get Specific Song", success, details)
        except Exception as e:
            return self.log_test("Get Specific Song", False, f"Error: {str(e)}")

    def test_stream_song(self):
        """Test streaming a song"""
        if not self.uploaded_song_id:
            return self.log_test("Stream Song", False, "No uploaded song ID available")
        
        try:
            response = requests.get(f"{self.api_url}/songs/{self.uploaded_song_id}/stream", timeout=10)
            success = response.status_code == 200
            content_length = len(response.content) if success else 0
            details = f"Status: {response.status_code}, Content Length: {content_length} bytes"
            return self.log_test("Stream Song", success, details)
        except Exception as e:
            return self.log_test("Stream Song", False, f"Error: {str(e)}")

    def test_toggle_favorite(self):
        """Test toggling favorite status"""
        if not self.uploaded_song_id:
            return self.log_test("Toggle Favorite", False, "No uploaded song ID available")
        
        try:
            response = requests.put(f"{self.api_url}/songs/{self.uploaded_song_id}/favorite", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Is Favorite: {data.get('is_favorite')}"
            return self.log_test("Toggle Favorite", success, details)
        except Exception as e:
            return self.log_test("Toggle Favorite", False, f"Error: {str(e)}")

    def test_get_stats_with_data(self):
        """Test getting stats after upload"""
        try:
            response = requests.get(f"{self.api_url}/stats", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Total Songs: {data.get('total_songs', 0)}, Favorites: {data.get('favorites', 0)}"
            return self.log_test("Get Stats (With Data)", success, details)
        except Exception as e:
            return self.log_test("Get Stats (With Data)", False, f"Error: {str(e)}")

    def test_create_playlist(self):
        """Test creating a playlist"""
        try:
            playlist_data = {
                "name": "Test Playlist",
                "description": "A test playlist created by automated testing"
            }
            
            response = requests.post(f"{self.api_url}/playlists", 
                                   json=playlist_data, 
                                   headers={'Content-Type': 'application/json'},
                                   timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Playlist ID: {data.get('id')}, Name: {data.get('name')}"
            return self.log_test("Create Playlist", success, details)
        except Exception as e:
            return self.log_test("Create Playlist", False, f"Error: {str(e)}")

    def test_get_playlists(self):
        """Test getting all playlists"""
        try:
            response = requests.get(f"{self.api_url}/playlists", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            details = f"Status: {response.status_code}, Playlists count: {len(data)}"
            return self.log_test("Get Playlists", success, details)
        except Exception as e:
            return self.log_test("Get Playlists", False, f"Error: {str(e)}")

    def test_get_settings(self):
        """Test getting user settings"""
        try:
            response = requests.get(f"{self.api_url}/settings", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Theme: {data.get('theme')}, Volume: {data.get('volume')}"
            return self.log_test("Get Settings", success, details)
        except Exception as e:
            return self.log_test("Get Settings", False, f"Error: {str(e)}")

    def test_update_settings(self):
        """Test updating user settings"""
        try:
            settings_data = {
                "theme": "light",
                "volume": 0.8,
                "equalizer_preset": "rock",
                "equalizer_bands": [2.0, 1.5, 0.0, -1.0, 0.5, 1.0, 2.0, 1.5, 0.0, -0.5],
                "repeat_mode": "track",
                "shuffle": True
            }
            
            response = requests.put(f"{self.api_url}/settings", 
                                  json=settings_data,
                                  headers={'Content-Type': 'application/json'},
                                  timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            details = f"Status: {response.status_code}, Updated Theme: {data.get('theme')}"
            return self.log_test("Update Settings", success, details)
        except Exception as e:
            return self.log_test("Update Settings", False, f"Error: {str(e)}")

    def test_nonexistent_song(self):
        """Test accessing a non-existent song"""
        try:
            fake_id = "nonexistent-song-id"
            response = requests.get(f"{self.api_url}/songs/{fake_id}", timeout=10)
            success = response.status_code == 404  # Should return 404
            details = f"Status: {response.status_code} (Expected 404)"
            return self.log_test("Get Nonexistent Song", success, details)
        except Exception as e:
            return self.log_test("Get Nonexistent Song", False, f"Error: {str(e)}")

    def run_all_tests(self):
        """Run all API tests in sequence"""
        print("🎵 Starting Music Player API Tests")
        print(f"🔗 Testing API at: {self.api_url}")
        print("=" * 60)
        
        # Basic connectivity tests
        self.test_health_check()
        self.test_get_songs_empty()
        self.test_get_stats_empty()
        
        # File upload tests
        self.test_upload_invalid_file()
        self.test_upload_song()
        
        # Song management tests
        self.test_get_songs_with_data()
        self.test_get_specific_song()
        self.test_stream_song()
        self.test_toggle_favorite()
        self.test_get_stats_with_data()
        
        # Playlist tests
        self.test_create_playlist()
        self.test_get_playlists()
        
        # Settings tests
        self.test_get_settings()
        self.test_update_settings()
        
        # Error handling tests
        self.test_nonexistent_song()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed! API is working correctly.")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed.")
            return 1

def main():
    """Main function to run all tests"""
    tester = MusicPlayerAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())