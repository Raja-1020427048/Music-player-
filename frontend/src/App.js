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
  const [playlists, setPlaylists] = useState([]);
  
  // UI State
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, library, folder, favorite, recent_play, recent_add, most_play, equalizer, playlists
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedSong, setSelectedSong] = useState(null);
  const [showSongDetails, setShowSongDetails] = useState(false);
  
  // Audio Settings
  const [equalizerBands, setEqualizerBands] = useState(Array(10).fill(0));
  const [bassBoost, setBassBoost] = useState(0);
  const [virtualizer, setVirtualizer] = useState(0);
  const [amplifier, setAmplifier] = useState(100);
  const [reverbMode, setReverbMode] = useState('Large Hall');
  const [soundBalance, setSoundBalance] = useState({ left: 0, right: 0 });
  const [repeatMode, setRepeatMode] = useState('off'); // off, current, all
  const [shuffleMode, setShuffleMode] = useState(false);
  
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
    fetchPlaylists();
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

  const fetchPlaylists = async () => {
    try {
      const response = await axios.get(`${API}/playlists`);
      setPlaylists(response.data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
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
        if (repeatMode === 'current') {
          playSong(song);
        } else {
          playNextSong();
        }
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
    let currentIndex = songs.findIndex(song => song.id === currentSong?.id);
    let nextIndex;
    
    if (shuffleMode) {
      nextIndex = Math.floor(Math.random() * songs.length);
    } else {
      nextIndex = (currentIndex + 1) % songs.length;
    }
    
    if (songs[nextIndex] && (repeatMode === 'all' || nextIndex !== currentIndex)) {
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
    setVolume(newVolume / 100);
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
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

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    try {
      await axios.post(`${API}/playlists`, {
        name: newPlaylistName,
        description: `Created on ${new Date().toLocaleDateString()}`
      });
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
      fetchPlaylists();
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  const addToPlaylist = async (playlistId, songId) => {
    try {
      await axios.put(`${API}/playlists/${playlistId}/songs/${songId}`);
      alert('Song added to playlist!');
    } catch (error) {
      console.error('Error adding to playlist:', error);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getFilteredSongs = () => {
    switch (currentView) {
      case 'favorite':
        return songs.filter(song => song.is_favorite);
      case 'recent_play':
        return songs.filter(song => song.last_played).sort((a, b) => new Date(b.last_played) - new Date(a.last_played));
      case 'recent_add':
        return songs.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
      case 'most_play':
        return songs.sort((a, b) => b.play_count - a.play_count);
      default:
        return songs;
    }
  };

  const StatCard = ({ title, value, color, icon, onClick }) => (
    <div className={`stat-card ${color}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-title">{title}</div>
      </div>
    </div>
  );

  const SideMenu = () => (
    <div className={`side-menu ${showSideMenu ? 'open' : ''}`}>
      <div className="side-menu-header">
        <h2>Music Player</h2>
        <button className="close-menu" onClick={() => setShowSideMenu(false)}>✕</button>
      </div>
      <div className="side-menu-items">
        <div className="menu-item" onClick={() => alert('App Locker feature coming soon!')}>
          <span className="menu-icon">🔒</span>
          <span>App Locker</span>
          <span className="menu-badge">AD</span>
        </div>
        <div className="menu-item" onClick={() => {
          fileInputRef.current?.click();
          setShowSideMenu(false);
        }}>
          <span className="menu-icon">📁</span>
          <span>Scan Library</span>
        </div>
        <div className="menu-item" onClick={() => {
          setCurrentView('equalizer');
          setShowSideMenu(false);
        }}>
          <span className="menu-icon">🎛️</span>
          <span>Equalizer</span>
        </div>
        <div className="menu-item" onClick={() => {
          setRepeatMode(repeatMode === 'current' ? 'off' : 'current');
          setShowSideMenu(false);
        }}>
          <span className="menu-icon">🔁</span>
          <span>Repeat Current</span>
        </div>
        <div className="menu-item" onClick={() => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          setShowSideMenu(false);
        }}>
          <span className="menu-icon">🎨</span>
          <span>Themes</span>
        </div>
        <div className="menu-item" onClick={() => alert('Widget feature coming soon!')}>
          <span className="menu-icon">📱</span>
          <span>Widget</span>
        </div>
        <div className="menu-item" onClick={() => alert('Sleep timer feature coming soon!')}>
          <span className="menu-icon">⏰</span>
          <span>Sleep timer</span>
        </div>
        <div className="menu-item" onClick={() => alert('Drive mode feature coming soon!')}>
          <span className="menu-icon">🚗</span>
          <span>Drive mode</span>
        </div>
        <div className="menu-item" onClick={() => alert('Hot app feature coming soon!')}>
          <span className="menu-icon">🔥</span>
          <span>Hot app</span>
          <span className="menu-badge red">9</span>
        </div>
        <div className="menu-item" onClick={() => alert('Settings opened!')}>
          <span className="menu-icon">⚙️</span>
          <span>Settings</span>
        </div>
        <div className="menu-item" onClick={() => {
          if (confirm('Are you sure you want to quit?')) {
            window.close();
          }
        }}>
          <span className="menu-icon">🚪</span>
          <span>Quit</span>
        </div>
      </div>
    </div>
  );

  const EqualizerView = () => (
    <div className="equalizer-view">
      <div className="equalizer-header">
        <button onClick={() => setCurrentView('dashboard')} className="back-btn">← Back</button>
        <div className="eq-tabs">
          <button className="eq-tab active">EQ</button>
          <button className="eq-tab">VOL</button>
        </div>
      </div>
      
      <div className="equalizer-content">
        <div className="eq-controls">
          <label className="eq-toggle">
            <input type="checkbox" />
            <span>EQ</span>
          </label>
          <select className="eq-preset">
            <option>Custom</option>
            <option>Rock</option>
            <option>Pop</option>
            <option>Jazz</option>
            <option>Classical</option>
          </select>
        </div>

        <div className="frequency-bands">
          {[31, 62, 125, 250, 500, '1k', '2k', '4k', '8k', '16k'].map((freq, index) => (
            <div key={index} className="freq-band">
              <div className="freq-value">+{equalizerBands[index] > 0 ? '' : ''}{Math.round(equalizerBands[index])}</div>
              <input
                type="range"
                min="-12"
                max="12"
                value={equalizerBands[index]}
                onChange={(e) => updateEqualizerBand(index, parseFloat(e.target.value))}
                className="freq-slider vertical"
                orient="vertical"
              />
              <div className="freq-label">{freq}</div>
            </div>
          ))}
        </div>

        <div className="audio-effects">
          <div className="effect-control">
            <div className="effect-knob">
              <input
                type="range"
                min="0"
                max="100"
                value={bassBoost}
                onChange={(e) => setBassBoost(e.target.value)}
                className="knob-input"
              />
            </div>
            <span>Bass Boost</span>
          </div>
          
          <div className="effect-control">
            <div className="effect-knob">
              <input
                type="range"
                min="0"
                max="100"
                value={virtualizer}
                onChange={(e) => setVirtualizer(e.target.value)}
                className="knob-input"
              />
            </div>
            <span>Virtualizer</span>
          </div>
        </div>

        <div className="volume-section">
          <div className="volume-control-full">
            <label>VOLUME</label>
            <input
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(e) => handleVolumeChange(e.target.value)}
              className="volume-slider-full"
            />
            <span>{Math.round(volume * 100)}%</span>
          </div>

          <div className="amplifier-control">
            <label>AMPLIFIER</label>
            <input
              type="range"
              min="0"
              max="200"
              value={amplifier}
              onChange={(e) => setAmplifier(e.target.value)}
              className="amplifier-slider"
            />
            <span>{amplifier}%</span>
          </div>

          <div className="reverb-control">
            <label>REVERB</label>
            <div className="reverb-options">
              {['Small Room', 'Middle Room', 'Large Room', 'Medium Hall', 'Large Hall', 'Plate'].map(mode => (
                <button
                  key={mode}
                  className={`reverb-btn ${reverbMode === mode ? 'active' : ''}`}
                  onClick={() => setReverbMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="balance-control">
            <label>SOUND BALANCE</label>
            <div className="balance-knobs">
              <div className="balance-knob">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={soundBalance.left}
                  onChange={(e) => setSoundBalance({...soundBalance, left: e.target.value})}
                  className="knob-input"
                />
                <span>Left</span>
              </div>
              <div className="balance-knob">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={soundBalance.right}
                  onChange={(e) => setSoundBalance({...soundBalance, right: e.target.value})}
                  className="knob-input"
                />
                <span>Right</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const SongDetailsModal = () => {
    if (!showSongDetails || !selectedSong) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowSongDetails(false)}>
        <div className="song-details-modal" onClick={e => e.stopPropagation()}>
          <div className="song-details-header">
            <button onClick={() => setShowSongDetails(false)} className="close-btn">←</button>
            <h3>{selectedSong.title}</h3>
            <button className="options-btn">⋮</button>
          </div>
          
          <div className="song-art">
            <div className="album-art-placeholder">🎵</div>
          </div>
          
          <div className="song-meta">
            <h2>{selectedSong.title}</h2>
            <p>&lt;unknown&gt;</p>
          </div>

          <div className="song-actions-grid">
            <div className="action-item" onClick={() => addToPlaylist('default', selectedSong.id)}>
              <span>➕</span>
              <span>Add to</span>
            </div>
            <div className="action-item">
              <span>👤</span>
              <span>Artist</span>
            </div>
            <div className="action-item">
              <span>💿</span>
              <span>Album</span>
            </div>
            <div className="action-item">
              <span>🖼️</span>
              <span>Artwork</span>
            </div>
            <div className="action-item">
              <span>🔔</span>
              <span>Ringtone</span>
            </div>
            <div className="action-item">
              <span>🎵</span>
              <span>Hide</span>
            </div>
            <div className="action-item">
              <span>📤</span>
              <span>Share</span>
            </div>
            <div className="action-item" onClick={() => {
              if (confirm('Delete this song?')) {
                // Delete functionality would go here
                setShowSongDetails(false);
              }
            }}>
              <span>🗑️</span>
              <span>Delete</span>
            </div>
          </div>

          <div className="song-progress">
            <span>🔊</span>
            <div className="progress-bar-mini">
              <div className="progress-fill" style={{width: '0%'}}></div>
            </div>
            <span>0%</span>
          </div>
        </div>
      </div>
    );
  };

  const PlaylistsView = () => (
    <div className="playlists-view">
      <div className="playlists-header">
        <h3>PLAYLIST ({playlists.length})</h3>
        <button 
          className="add-playlist-btn"
          onClick={() => setShowCreatePlaylist(true)}
        >
          +
        </button>
      </div>
      
      <div className="playlists-grid">
        {playlists.map((playlist, index) => (
          <div key={playlist.id} className={`playlist-card ${['blue', 'green', 'purple'][index % 3]}`}>
            <div className="playlist-icon">📝</div>
            <div className="playlist-info">
              <div className="playlist-count">{playlist.song_ids?.length || 0}</div>
              <div className="playlist-name">{playlist.name}</div>
            </div>
          </div>
        ))}
        
        {/* Default mood playlists */}
        <div className="playlist-card blue">
          <div className="playlist-icon">📝</div>
          <div className="playlist-info">
            <div className="playlist-count">85</div>
            <div className="playlist-name">Badass</div>
          </div>
        </div>
        <div className="playlist-card green">
          <div className="playlist-icon">📝</div>
          <div className="playlist-info">
            <div className="playlist-count">20</div>
            <div className="playlist-name">sad mood</div>
          </div>
        </div>
        <div className="playlist-card purple">
          <div className="playlist-icon">📝</div>
          <div className="playlist-info">
            <div className="playlist-count">55</div>
            <div className="playlist-name">Mood</div>
          </div>
        </div>
      </div>

      {showCreatePlaylist && (
        <div className="modal-overlay">
          <div className="create-playlist-modal">
            <h3>Create New Playlist</h3>
            <input
              type="text"
              placeholder="Enter playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="playlist-name-input"
            />
            <div className="modal-actions">
              <button onClick={() => setShowCreatePlaylist(false)} className="cancel-btn">Cancel</button>
              <button onClick={createPlaylist} className="create-btn">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`music-player-app ${theme}`}>
      <audio ref={audioRef} />
      
      {/* Side Menu Overlay */}
      {showSideMenu && <div className="menu-overlay" onClick={() => setShowSideMenu(false)}></div>}
      
      {/* Side Menu */}
      <SideMenu />

      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <button className="menu-btn" onClick={() => setShowSideMenu(true)}>
            ☰
          </button>
          <h1 className="app-title">
            <span className="music-icon">🎵</span>
            Music Player
          </h1>
          <div className="header-actions">
            <span className="notification-badge">AD</span>
            <button className="search-btn">🔍</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {currentView === 'dashboard' && (
          <>
            {/* Stats Dashboard */}
            <section className="stats-section">
              <div className="stats-grid">
                <StatCard
                  title="LIBRARY"
                  value={stats.total_songs || 0}
                  color="blue"
                  icon="🎵"
                  onClick={() => setCurrentView('library')}
                />
                <StatCard
                  title="FOLDER"
                  value="34"
                  color="orange"
                  icon="📁"
                  onClick={() => setCurrentView('folder')}
                />
                <StatCard
                  title="FAVORITE"
                  value={stats.favorites || 0}
                  color="red"
                  icon="❤️"
                  onClick={() => setCurrentView('favorite')}
                />
              </div>
              
              <div className="stats-grid">
                <StatCard
                  title="RECENT PLAY"
                  value={stats.recent_plays || 0}
                  color="teal"
                  icon="⏯️"
                  onClick={() => setCurrentView('recent_play')}
                />
                <StatCard
                  title="RECENT ADD"
                  value="51"
                  color="green"
                  icon="⏏️"
                  onClick={() => setCurrentView('recent_add')}
                />
                <StatCard
                  title="MOST PLAY"
                  value="467"
                  color="purple"
                  icon="🎧"
                  onClick={() => setCurrentView('most_play')}
                />
              </div>
            </section>

            {/* Playlists Section */}
            <PlaylistsView />

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
          </>
        )}

        {currentView === 'equalizer' && <EqualizerView />}

        {(currentView === 'library' || currentView === 'favorite' || currentView === 'recent_play' || currentView === 'recent_add' || currentView === 'most_play') && (
          <section className="songs-section">
            <div className="section-header">
              <button onClick={() => setCurrentView('dashboard')} className="back-btn">← Back</button>
              <h3>{currentView.replace('_', ' ').toUpperCase()}</h3>
            </div>
            <div className="songs-list">
              {getFilteredSongs().map((song) => (
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
                    <button
                      className="details-btn"
                      onClick={() => {
                        setSelectedSong(song);
                        setShowSongDetails(true);
                      }}
                    >
                      ⋮
                    </button>
                    <span className="play-count">{song.play_count} plays</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Song Details Modal */}
      <SongDetailsModal />

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
              <button 
                onClick={() => setShuffleMode(!shuffleMode)}
                className={`control-btn ${shuffleMode ? 'active' : ''}`}
              >
                🔀
              </button>
              <button 
                onClick={() => setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'current' : 'off')}
                className={`control-btn ${repeatMode !== 'off' ? 'active' : ''}`}
              >
                {repeatMode === 'current' ? '🔂' : '🔁'}
              </button>
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
                max="100"
                value={volume * 100}
                onChange={(e) => handleVolumeChange(e.target.value)}
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