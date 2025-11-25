# ZenTab 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.0+-61dafb.svg)](https://reactjs.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Ready-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

> A powerful browser extension that enables seamless AI-powered coding workflows by connecting DeepSeek tabs with your local development environment.

![ZenTab Banner](https://via.placeholder.com/1200x400/1a1a2e/eaeaea?text=ZenTab+-+AI+Powered+Development+Extension)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [API Reference](#-api-reference)
- [Development](#-development)
- [Contributing](#-contributing)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)
- [Contact](#-contact)

---

## 🌟 Overview

**ZenTab** is a Chrome/Firefox extension that bridges the gap between AI chat interfaces (specifically DeepSeek) and your local development environment. It manages multiple DeepSeek chat tabs, tracks their states, and routes AI requests efficiently through WebSocket connections.

### Why ZenTab?

- **Multi-Tab Management**: Handle multiple AI conversations simultaneously
- **State Tracking**: Real-time monitoring of tab status (free, busy, sleep)
- **WebSocket Integration**: Low-latency communication with backend services
- **Smart Routing**: Automatic tab selection based on availability and folder context
- **Auto-Recovery**: Intelligent recovery from stuck states

---

## ✨ Key Features

### 🔄 Tab State Management
- **Real-time Status Tracking**: Monitor tabs as `free`, `busy`, or `sleep`
- **Auto-Detection**: Automatically detect new DeepSeek tabs
- **Sleep Tab Support**: Integration with Auto Tab Discard extension
- **Folder Linking**: Associate tabs with specific project folders

### 🌐 WebSocket Communication
- **Single Connection**: Efficient single WebSocket connection to backend
- **Protocol Auto-Detection**: Supports both `ws://` and `wss://`
- **Ping/Pong Monitoring**: Health checks every 45 seconds
- **Message Deduplication**: Prevents duplicate message processing

### 🤖 AI Interaction
- **Prompt Management**: Send structured prompts with system/user separation
- **Response Polling**: Intelligent polling for AI responses
- **XML Tag Handling**: Proper parsing of tool tags (`<read_file>`, `<write_to_file>`, etc.)
- **Code Block Preservation**: Maintains exact indentation and formatting

### 🛡️ Reliability
- **Mutex Locking**: Prevents race conditions in state updates
- **Cache Management**: 10-second TTL cache for performance
- **Auto-Recovery**: Detects and recovers stuck tabs every 10 seconds
- **Error Handling**: Comprehensive error handling with detailed logging

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Extension                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Sidebar    │◄────►│   Service    │◄────►│ WebSocket │ │
│  │   (React)    │      │   Worker     │      │  Manager  │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│         │                      │                     │       │
│         │                      │                     │       │
│         ▼                      ▼                     ▼       │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │  TabState    │      │   DeepSeek   │      │    Tab    │ │
│  │   Manager    │      │  Controller  │      │ Broadcaster│ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│                                                               │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                │ WebSocket (ws:// or wss://)
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Backend Server      │
                    │   (Your Application)  │
                    └───────────────────────┘
```

### Core Components

#### 1. **Service Worker** (`service-worker.ts`)
- Extension background script
- Manages WebSocket lifecycle
- Routes messages between components
- Handles storage change events

#### 2. **WebSocket Manager** (`ws-manager-new.ts`)
- Single connection management
- Protocol auto-detection (ws/wss)
- Message broadcasting
- Health monitoring

#### 3. **Tab State Manager** (`tab-state-manager.ts`)
- Tab state tracking (free/busy/sleep)
- Folder linking
- Auto-recovery
- Cache management

#### 4. **DeepSeek Controller** (`deepseek-controller.ts`)
- Chat operations (new chat, stop generation)
- Prompt sending with dual-format support
- Response polling
- XML/Markdown parsing

#### 5. **Sidebar UI** (`Sidebar.tsx`)
- React-based user interface
- Tab status visualization
- WebSocket connection control
- Settings management

---

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Chrome/Firefox browser
- Backend server with WebSocket support

### From Source

```bash
# Clone repository
git clone https://github.com/KhanhRomVN/ZenTab.git
cd ZenTab

# Install dependencies
npm install

# Build extension
npm run build

# Development mode (with hot reload)
npm run dev
```

### Load Extension

#### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

#### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist` folder

---

## ⚙️ Configuration

### API Provider Setup

1. Click the **Settings** icon (⚙️) in the sidebar
2. Enter your backend API provider:
   - Local: `localhost:3030`
   - Remote HTTP: `http://example.com:8080`
   - Remote HTTPS: `https://example.com`

**Protocol Auto-Detection:**
- `localhost:3030` → `ws://localhost:3030/ws`
- `http://example.com` → `ws://example.com:3030/ws`
- `https://example.com` → `wss://example.com/ws`

### Backend Requirements

Your backend must:
- Accept WebSocket connections at `/ws` endpoint
- Send `ping` messages every 45 seconds
- Handle these message types:
  - `sendPrompt` - Send prompts to DeepSeek tabs
  - `getAvailableTabs` - Query available tabs
  - `getTabsByFolder` - Query tabs by folder
  - `cleanupFolderLink` - Clean folder links

---

## 📚 Usage Guide

### Basic Workflow

1. **Open DeepSeek Tabs**
   ```
   Navigate to https://chat.deepseek.com/
   ```

2. **Connect WebSocket**
   ```
   Click the Power button (⚡) in sidebar
   Status indicator turns green when connected
   ```

3. **Send Prompt from Backend**
   ```json
   {
     "type": "sendPrompt",
     "tabId": 123456,
     "systemPrompt": "You are a helpful assistant",
     "userPrompt": "Write a Python function",
     "requestId": "req-abc123",
     "isNewTask": false
   }
   ```

4. **Receive Response**
   ```json
   {
     "type": "promptResponse",
     "requestId": "req-abc123",
     "success": true,
     "response": "{...OpenAI format...}",
     "timestamp": 1234567890
   }
   ```

### Advanced Features

#### Folder Linking
Associate tabs with project folders for context-aware routing:

```javascript
await TabStateManager.linkTabToFolder(tabId, "/path/to/project");
```

#### Sleep Tab Management
Tabs can enter sleep mode (via Auto Tab Discard):
- Status indicator shows "💤"
- Tab cannot accept new requests
- Use `wakeUpTab()` to restore

#### Custom Prompt Rules
ZenTab enforces Vietnamese language and XML formatting rules:
- All responses in Vietnamese
- XML tags wrapped in ` ```text ` blocks
- Exact indentation preservation
- Task progress tracking

---

## 🔌 API Reference

### Message Types

#### `sendPrompt`
Send a prompt to a DeepSeek tab.

**Request:**
```typescript
{
  type: "sendPrompt",
  tabId: number,
  systemPrompt: string | null,
  userPrompt: string,
  requestId: string,
  isNewTask?: boolean,
  folderPath?: string
}
```

**Response:**
```typescript
{
  type: "promptResponse",
  requestId: string,
  tabId: number,
  success: boolean,
  response?: string,  // OpenAI format
  error?: string
}
```

#### `getAvailableTabs`
Query all available DeepSeek tabs.

**Request:**
```typescript
{
  type: "getAvailableTabs",
  requestId: string
}
```

**Response:**
```typescript
{
  type: "availableTabs",
  requestId: string,
  tabs: Array<{
    tabId: number,
    containerName: string,
    title: string,
    status: "free" | "busy" | "sleep",
    canAccept: boolean,
    requestCount: number,
    folderPath?: string
  }>
}
```

#### `getTabsByFolder`
Query tabs linked to a specific folder.

**Request:**
```typescript
{
  type: "getTabsByFolder",
  requestId: string,
  folderPath: string
}
```

**Response:**
```typescript
{
  type: "availableTabs",
  requestId: string,
  tabs: Array<TabStateInfo>
}
```

---

## 🛠️ Development

### Project Structure

```
ZenTab/
├── src/
│   ├── background/          # Service worker & controllers
│   │   ├── deepseek/        # DeepSeek AI integration
│   │   ├── utils/           # Utilities (TabStateManager)
│   │   └── websocket/       # WebSocket management
│   ├── presentation/        # UI components
│   │   └── components/
│   │       ├── sidebar/     # Sidebar UI
│   │       └── common/      # Reusable components
│   └── shared/              # Shared utilities
│       └── lib/             # Helper libraries
├── manifest.json            # Extension manifest
└── package.json
```

### Build Scripts

```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

### Debug Mode

Enable verbose logging:
```javascript
// In service-worker.ts
const DEBUG = true;
```

View logs in:
- Chrome: `chrome://extensions/` → "Inspect views"
- Firefox: `about:debugging` → "Inspect"

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
4. **Push to branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

### Coding Guidelines
- Use TypeScript for type safety
- Follow existing code style
- Add JSDoc comments for public APIs
- Write unit tests for new features
- Keep functions under 50 lines

---

## 🐛 Troubleshooting

### WebSocket won't connect
**Symptoms:** Status indicator stays gray/yellow

**Solutions:**
1. Verify backend is running
2. Check firewall settings
3. Ensure correct protocol (ws/wss)
4. Check browser console for errors

### Tabs stuck in "busy" state
**Symptoms:** Tab shows busy but no AI response

**Solutions:**
1. Wait 10 seconds for auto-recovery
2. Click "Force Reset" in sidebar
3. Check DeepSeek tab for UI errors
4. Restart browser

### Missing tab states
**Symptoms:** Tabs not appearing in sidebar

**Solutions:**
1. Reload DeepSeek tabs
2. Check if URL matches `chat.deepseek.com`
3. Open browser console for errors
4. Reinstall extension

### Response parsing errors
**Symptoms:** Backend receives malformed responses

**Solutions:**
1. Check if DeepSeek UI changed
2. Enable debug logging
3. Verify XML tag structure
4. Check code block formatting

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 KhanhRomVN

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📧 Contact

**Khánh Rom**
- GitHub: [@KhanhRomVN](https://github.com/KhanhRomVN)
- Email: khanhromvn@gmail.com

**Project Link:** [https://github.com/KhanhRomVN/ZenTab](https://github.com/KhanhRomVN/ZenTab)

---

## 🙏 Acknowledgments

- [DeepSeek](https://www.deepseek.com/) - AI platform
- [React](https://reactjs.org/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Lucide Icons](https://lucide.dev/) - Icon library
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

<div align="center">

Made with ❤️ by [KhanhRomVN](https://github.com/KhanhRomVN)

⭐ Star this repo if you find it helpful!

</div>