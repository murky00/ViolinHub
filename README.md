# Violin Studio (ViolinHub)

An all-in-one smart practice environment designed for violinists, teachers, and students. It integrates video analysis, real-time annotation, professional practice tools, and session recording into a single, cohesive workflow.

![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
![JavaScript](https://img.shields.io/badge/Frontend-VanillaJS-F7DF1E?style=flat-square&logo=javascript)
![TailwindCSS](https://img.shields.io/badge/CSS-Tailwind-38B2AC?style=flat-square&logo=tailwind-css)

## Core Features

### Smart Video Workspace
- Interactive Annotations: Add notes at specific timestamps; click to jump back to analyze technical details.
- Mirror Mode: Flip the video horizontally to observe posture and bow distribution as if looking into a mirror.
- A-B Looping: Define start and end points to loop difficult passages indefinitely.

### Professional Practice Toolkit
- Advanced Metronome: Supports multiple time signatures (2/4, 3/4, 4/4, 6/8) and presets. Powered by Web Audio API for high precision.
- Chromatic Tuner: Real-time pitch detection with visual reinforcement for the violin's open strings (G, D, A, E).
- Pitch Reference: Built-in pure sine wave generator for A4 (440Hz) and other tuning references.

### Session Recording & Feedback
- PiP Recording: Record your own practice via webcam as a Picture-in-Picture overlay while the demonstration video plays.
- Audio Mixing: Automatically mixes the metronome click into the recorded video track for rhythm analysis.
- Auto-Management: Recordings are automatically named and saved to the 'Upload_Inbox' folder.

### AI Assistant (Beta)
- Extensible Chat Interface: Stubbed for Ollama or OpenAI integration to provide context-aware practice suggestions.

## Quick Start

### 1. Prerequisites
Ensure macOS is running Python 3.9+.

### 2. Install Dependencies
```bash
pip install fastapi uvicorn
```

### 3. Project Structure
The app automatically initializes the following directories:
- 1_Repertoire/: Store demonstration videos or sheet music.
- 2_Practice_Logs/: Archive previous practice sessions.
- Upload_Inbox/: Default storage for locally recorded sessions.
- static/: Core frontend assets (HTML, JS, CSS).

### 4. Launch
Run via the Cursor terminal:
```bash
python main.py
```
Or via uvicorn:
```bash
uvicorn main:app --reload
```
Access the dashboard at: http://127.0.0.1:8000

## Directory Navigation
```text
ViolinHub/
├── main.py              # FastAPI backend & file management
├── static/
│   ├── index.html       # Responsive UI (Tailwind CSS)
│   └── app.js           # Logic, audio algorithms, and recorder
├── annotations.json     # Persistent database for video notes
└── Upload_Inbox/        # Auto-save directory for recordings
```

## Tech Stack
- Backend: Python / FastAPI
- Frontend: Vanilla JavaScript / Tailwind CSS
- Audio Engine: Web Audio API (Metronome, Tuner, Mix-bus)
- Persistence: JSON (Annotations) / Local File System (Media)

## Usage Tips
- Spacebar: Global play/pause toggle for the video player.
- iPad Optimized: Supports front/rear camera switching, perfect for music stands.
- PDF Integration: View scores directly below the video player by placing PDFs in the library.