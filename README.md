# 🎻 Violin Studio (ViolinHub)

一个为小提琴家、教师和学生打造的全栈式智能练习辅助环境。集成视频分析、实时标注、专业练习工具及练习录制功能。

![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
![JavaScript](https://img.shields.io/badge/Frontend-VanillaJS-F7DF1E?style=flat-square&logo=javascript)
![TailwindCSS](https://img.shields.io/badge/CSS-Tailwind-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ 核心特性

### 🎥 智能视频工作区
- **交互式标注**：在视频任意时间点添加笔记，点击时间戳跳转，方便回看技术细节。
- **镜像模式 (Mirror)**：一键翻转画面，像照镜子一样观察持琴姿势和弓段分配。
- **A-B 循环段落**：自定义起止点，反复循环攻克技术难点。

### 🛠 专业练习工具箱
- **高级节拍器**：支持多种拍号（2/4, 3/4, 4/4, 6/8）和速度预设，Web Audio API 驱动，精准稳定。
- **全频调音器**：实时频率检测，针对小提琴四根开弦（G, D, A, E）进行了视觉强化。
- **标准音参考**：内置纯正正弦波 A4 440Hz 及其他音高参考。

### ⏺ 练习录制与反馈
- **画中画录制**：支持在播放示范视频的同时，开启摄像头录制自己的练习画面。
- **音频混音**：录制时会自动将节拍器的点击声混合进视频音轨，方便后期对位分析。
- **自动管理**：录制后的视频自动重命名并保存至 `Upload_Inbox` 文件夹。

### 🤖 AI 助手 (Beta)
- 预留 AI 对话接口，可对接 Ollama 或 OpenAI，通过上下文感知你的练习进度并提供建议。

## 🚀 快速开始

### 1. 环境准备
确保你的 MacOS 已安装 Python 3.9+。

### 2. 安装依赖
```bash
pip install fastapi uvicorn
```

### 3. 项目结构说明
项目启动前会自动创建以下目录：
- `1_Repertoire/`: 存放你的示范视频或曲谱。
- `2_Practice_Logs/`: 存放练习视频。
- `Upload_Inbox/`: 本地录制视频的默认存储地。
- `static/`: 前端核心文件（HTML, JS, CSS）。

### 4. 启动服务
在 Cursor 终端输入：
```bash
python main.py
```
或者直接运行：
```bash
uvicorn main:app --reload
```
访问地址：`http://127.0.0.1:8000`

## 📁 目录导航
```text
ViolinHub/
├── main.py              # FastAPI 后端路由与文件管理
├── static/
│   ├── index.html       # 响应式 UI (Tailwind CSS)
│   └── app.js           # 前端逻辑、音频算法、录制逻辑
├── annotations.json     # 视频笔记持久化数据库
└── Upload_Inbox/        # 录制视频自动存放处
```

## 🛠 技术栈
- **后端**: Python / FastAPI
- **前端**: Vanilla JavaScript / Tailwind CSS
- **音频**: Web Audio API (用于节拍器、调音器、音轨混合)
- **存储**: JSON (用于标注) / 本地文件系统 (用于媒体)

## 📝 使用 Tips
- **空格键**：全局控制视频播放/暂停。
- **iPad 支持**：针对 iPad 进行了适配，支持前后摄像头切换，适合架在谱架上练习使用。
- **PDF 查看**：将曲谱存入库中，即可在视频下方同步查看 PDF。

---
*Inspired by the pursuit of musical perfection.* 🎻
```

---
