from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import aiofiles
import mimetypes
from mutagen import File as MutagenFile
from mutagen.id3 import ID3NoHeaderError
import base64
import io


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create upload directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class Song(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    artist: str = "Unknown Artist"
    album: str = "Unknown Album"
    duration: float = 0.0
    file_path: str
    file_size: int = 0
    mime_type: str = ""
    play_count: int = 0
    is_favorite: bool = False
    date_added: datetime = Field(default_factory=datetime.utcnow)
    last_played: Optional[datetime] = None

class SongCreate(BaseModel):
    title: str
    artist: str = "Unknown Artist"
    album: str = "Unknown Album"

class Playlist(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    song_ids: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PlaylistCreate(BaseModel):
    name: str
    description: str = ""

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    theme: str = "dark"  # dark or light
    volume: float = 0.7
    equalizer_preset: str = "default"
    equalizer_bands: List[float] = Field(default=[0.0] * 10)
    repeat_mode: str = "off"  # off, track, all
    shuffle: bool = False


def extract_metadata(file_path: str) -> dict:
    """Extract metadata from audio file"""
    try:
        audio_file = MutagenFile(file_path)
        if audio_file is None:
            return {}
        
        metadata = {}
        
        # Get basic info
        if hasattr(audio_file, 'info'):
            metadata['duration'] = getattr(audio_file.info, 'length', 0.0)
            metadata['bitrate'] = getattr(audio_file.info, 'bitrate', 0)
        
        # Get tags
        tags = audio_file.tags or {}
        
        # Common tag mappings
        metadata['title'] = str(tags.get('TIT2', [''])[0]) if 'TIT2' in tags else \
                           str(tags.get('TITLE', [''])[0]) if 'TITLE' in tags else ""
        metadata['artist'] = str(tags.get('TPE1', [''])[0]) if 'TPE1' in tags else \
                            str(tags.get('ARTIST', [''])[0]) if 'ARTIST' in tags else ""
        metadata['album'] = str(tags.get('TALB', [''])[0]) if 'TALB' in tags else \
                           str(tags.get('ALBUM', [''])[0]) if 'ALBUM' in tags else ""
        
        # Get album art
        album_art = None
        if 'APIC:' in tags:
            album_art = tags['APIC:'].data
        elif 'ARTWORK' in tags:
            album_art = tags['ARTWORK'][0]
        
        if album_art:
            metadata['album_art'] = base64.b64encode(album_art).decode('utf-8')
        
        return metadata
    except Exception as e:
        logging.error(f"Error extracting metadata: {e}")
        return {}


# API Routes
@api_router.get("/")
async def root():
    return {"message": "Music Player API"}

@api_router.post("/songs/upload")
async def upload_song(file: UploadFile = File(...)):
    """Upload a music file"""
    # Check file type
    if not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Extract metadata
        metadata = extract_metadata(str(file_path))
        
        # Create song object
        song_data = {
            "title": metadata.get('title') or Path(file.filename).stem,
            "artist": metadata.get('artist') or "Unknown Artist",
            "album": metadata.get('album') or "Unknown Album",
            "duration": metadata.get('duration', 0.0),
            "file_path": str(file_path),
            "file_size": len(content),
            "mime_type": file.content_type
        }
        
        song = Song(**song_data)
        await db.songs.insert_one(song.dict())
        
        return song
    except Exception as e:
        # Clean up file if error
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@api_router.get("/songs", response_model=List[Song])
async def get_songs():
    """Get all songs"""
    songs = await db.songs.find().to_list(1000)
    return [Song(**song) for song in songs]

@api_router.get("/songs/{song_id}", response_model=Song)
async def get_song(song_id: str):
    """Get a specific song"""
    song = await db.songs.find_one({"id": song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return Song(**song)

@api_router.get("/songs/{song_id}/stream")
async def stream_song(song_id: str, range: str = None):
    """Stream a song file"""
    song = await db.songs.find_one({"id": song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    file_path = Path(song["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Song file not found")
    
    # Update play count and last played
    await db.songs.update_one(
        {"id": song_id},
        {
            "$inc": {"play_count": 1},
            "$set": {"last_played": datetime.utcnow()}
        }
    )
    
    file_size = file_path.stat().st_size
    
    async def generate():
        async with aiofiles.open(file_path, 'rb') as f:
            while True:
                chunk = await f.read(8192)
                if not chunk:
                    break
                yield chunk
    
    return StreamingResponse(
        generate(),
        media_type=song["mime_type"],
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes"
        }
    )

@api_router.put("/songs/{song_id}/favorite")
async def toggle_favorite(song_id: str):
    """Toggle favorite status of a song"""
    song = await db.songs.find_one({"id": song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    new_favorite_status = not song.get("is_favorite", False)
    await db.songs.update_one(
        {"id": song_id},
        {"$set": {"is_favorite": new_favorite_status}}
    )
    
    return {"is_favorite": new_favorite_status}

@api_router.get("/stats")
async def get_stats():
    """Get library statistics"""
    total_songs = await db.songs.count_documents({})
    favorites = await db.songs.count_documents({"is_favorite": True})
    
    # Get recent plays (last 7 days)
    recent_date = datetime.utcnow().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    recent_plays = await db.songs.count_documents({
        "last_played": {"$gte": recent_date}
    })
    
    # Get most played songs
    most_played = await db.songs.find().sort("play_count", -1).limit(10).to_list(10)
    
    return {
        "total_songs": total_songs,
        "favorites": favorites,
        "recent_plays": recent_plays,
        "most_played": [Song(**song) for song in most_played]
    }

@api_router.post("/playlists", response_model=Playlist)
async def create_playlist(playlist_data: PlaylistCreate):
    """Create a new playlist"""
    playlist = Playlist(**playlist_data.dict())
    await db.playlists.insert_one(playlist.dict())
    return playlist

@api_router.get("/playlists", response_model=List[Playlist])
async def get_playlists():
    """Get all playlists"""
    playlists = await db.playlists.find().to_list(1000)
    return [Playlist(**playlist) for playlist in playlists]

@api_router.put("/playlists/{playlist_id}/songs/{song_id}")
async def add_song_to_playlist(playlist_id: str, song_id: str):
    """Add a song to a playlist"""
    playlist = await db.playlists.find_one({"id": playlist_id})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    song = await db.songs.find_one({"id": song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    if song_id not in playlist["song_ids"]:
        await db.playlists.update_one(
            {"id": playlist_id},
            {
                "$push": {"song_ids": song_id},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
    
    return {"message": "Song added to playlist"}

@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    """Get user settings"""
    settings = await db.settings.find_one() or {}
    return UserSettings(**settings)

@api_router.put("/settings")
async def update_settings(settings: UserSettings):
    """Update user settings"""
    await db.settings.replace_one(
        {},
        settings.dict(),
        upsert=True
    )
    return settings

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()