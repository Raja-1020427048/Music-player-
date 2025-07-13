import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MusicPlayer = () => {
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [equalizerBands, setEqualizerBands] = useState(Array(10).fill(0));
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const gainNodesRef = useRef([]);

  useEffect(() => {
    fetchSongs();
    fetchStats();
    initializeAudioContext();
  }, []);

  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      // Create equalizer gain nodes
      gainNodesRef.current = [];
      for (let i = 0; i < 10; i++) {
        const gainNode = audioContextRef.current.createGain();
        gainNode.connect(i === 9 ? analyserRef.current : gainNodesRef.current[i + 1] || analyserRef.current);
        gainNodesRef.current.push(gainNode);
      }
      
      analyserRef.current.connect(audioContextRef.current.destination);
    }
  };

  const fetchSongs = async () => {
    try {
      const response = await axios.get(`${API}/songs`);
      setSongs(response.data);
    } catch (error) {
      console.error('Error fetching songs:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        setUploadProgress(((i + 1) / files.length) * 100);
        await axios.post(`${API}/songs/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }

    setIsUploading(false);
    setUploadProgress(0);
    fetchSongs();
    fetchStats();
  };

  const playSong = (song) => {
    if (currentSong?.id === song.id && isPlaying) {
      pauseSong();
      return;
    }

    setCurrentSong(song);
    setIsLoading(true);
    
    if (audioRef.current) {
      audioRef.current.src = `${API}/songs/${song.id}/stream`;
      audioRef.current.load();
      
      audioRef.current.onloadeddata = () => {
        setIsLoading(false);
        audioRef.current.play();
        setIsPlaying(true);
        setDuration(audioRef.current.duration);
      };

      audioRef.current.ontimeupdate = () => {
        setCurrentTime(audioRef.current.currentTime);
      };

      audioRef.current.onended = () => {
        setIsPlaying(false);
        playNextSong();
      };
    }
  };

  const pauseSong = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const playNextSong = () => {
    const currentIndex = songs.findIndex(song => song.id === currentSong?.id);
    const nextIndex = (currentIndex + 1) % songs.length;
    if (songs[nextIndex]) {
      playSong(songs[nextIndex]);
    }
  };

  const playPreviousSong = () => {
    const currentIndex = songs.findIndex(song => song.id === currentSong?.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : songs.length - 1;
    if (songs[prevIndex]) {
      playSong(songs[prevIndex]);
    }
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleSeek = (event) => {
    const seekTime = (event.target.value / 100) * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const toggleFavorite = async (songId) => {
    try {
      await axios.put(`${API}/songs/${songId}/favorite`);
      fetchSongs();
      fetchStats();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const updateEqualizerBand = (index, value) => {
    const newBands = [...equalizerBands];
    newBands[index] = value;
    setEqualizerBands(newBands);
    
    if (gainNodesRef.current[index]) {
      gainNodesRef.current[index].gain.value = value;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const StatCard = ({ title, value, color, icon }) => (
    <div className={`stat-card ${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-title">{title}</div>
      </div>
    </div>
  );

  return (
    <div className={`music-player-app ${theme}`}>
      <audio ref={audioRef} />
      
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="music-icon">🎵</span>
            Music Player
          </h1>
          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              className="equalizer-toggle"
              onClick={() => setShowEqualizer(!showEqualizer)}
            >
              🎚️
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Stats Dashboard */}
        <section className="stats-section">
          <div className="stats-grid">
            <StatCard
              title="LIBRARY"
              value={stats.total_songs || 0}
              color="blue"
              icon="🎵"
            />
            <StatCard
              title="FAVORITES"
              value={stats.favorites || 0}
              color="red"
              icon="❤️"
            />
            <StatCard
              title="RECENT PLAY"
              value={stats.recent_plays || 0}
              color="green"
              icon="⏯️"
            />
            <StatCard
              title="PLAYLISTS"
              value="3"
              color="purple"
              icon="📝"
            />
          </div>
        </section>

        {/* Upload Section */}
        <section className="upload-section">
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="audio/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : '+ Add Music'}
          </button>
        </section>

        {/* Equalizer */}
        {showEqualizer && (
          <section className="equalizer-section">
            <h3>Equalizer</h3>
            <div className="equalizer">
              {equalizerBands.map((value, index) => (
                <div key={index} className="eq-band">
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    value={value}
                    onChange={(e) => updateEqualizerBand(index, parseFloat(e.target.value))}
                    className="eq-slider"
                    orient="vertical"
                  />
                  <span className="eq-label">
                    {[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000][index]}Hz
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Song List */}
        <section className="songs-section">
          <h3>Your Music Library</h3>
          <div className="songs-list">
            {songs.map((song) => (
              <div
                key={song.id}
                className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
              >
                <div className="song-info" onClick={() => playSong(song)}>
                  <div className="song-title">{song.title}</div>
                  <div className="song-meta">
                    {song.artist} • {song.album} • {formatTime(song.duration)}
                  </div>
                </div>
                <div className="song-actions">
                  <button
                    className={`favorite-btn ${song.is_favorite ? 'active' : ''}`}
                    onClick={() => toggleFavorite(song.id)}
                  >
                    ❤️
                  </button>
                  <span className="play-count">{song.play_count} plays</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Player Controls */}
      {currentSong && (
        <footer className="player-footer">
          <div className="player-content">
            <div className="current-song-info">
              <div className="song-title">{currentSong.title}</div>
              <div className="song-artist">{currentSong.artist}</div>
            </div>
            
            <div className="player-controls">
              <button onClick={playPreviousSong} className="control-btn">⏮️</button>
              <button onClick={() => isPlaying ? pauseSong() : playSong(currentSong)} className="play-btn">
                {isLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'}
              </button>
              <button onClick={playNextSong} className="control-btn">⏭️</button>
            </div>

            <div className="player-progress">
              <span className="time">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={duration ? (currentTime / duration) * 100 : 0}
                onChange={handleSeek}
                className="progress-bar"
              />
              <span className="time">{formatTime(duration)}</span>
            </div>

            <div className="volume-control">
              <span>🔊</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="volume-slider"
              />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

export default MusicPlayer;