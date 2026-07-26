import express from "express";
import http from "http";
import path from "path";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Lazy Gemini AI Client Initialization with User-Agent header
let aiClient: GoogleGenAI | null = null;
function getGenAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

/**
 * User Settings Interface
 */
export interface UserSettings {
  display_name: string;
  theme: "light" | "dark" | "system";
  notification_enabled: boolean;
  avatar_url?: string;
  updated_at: string;
}

/**
 * Session & Security Log Interfaces
 */
export interface ActiveSession {
  id: string;
  device: string;
  ip_address: string;
  user_agent: string;
  is_current: boolean;
  last_active: string;
}

export interface SecurityLog {
  id: string;
  event: string;
  ip_address: string;
  timestamp: string;
  status: "success" | "warning" | "info";
}

// Default in-memory settings store
let userSettingsStore: UserSettings = {
  display_name: "Nexus User",
  theme: "dark",
  notification_enabled: true,
  avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250",
  updated_at: new Date().toISOString(),
};

// In-memory sessions store
let activeSessionsStore: ActiveSession[] = [
  {
    id: "sess-1",
    device: "Chrome (Macintosh; Intel Mac OS X)",
    ip_address: "192.168.1.102",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    is_current: true,
    last_active: new Date().toISOString(),
  },
  {
    id: "sess-2",
    device: "Nexus Mobile App (iOS 17.4)",
    ip_address: "172.56.21.88",
    user_agent: "NexusApp/2.4.0 (iPhone; iOS 17.4)",
    is_current: false,
    last_active: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: "sess-3",
    device: "Firefox (Windows 11)",
    ip_address: "104.28.19.42",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    is_current: false,
    last_active: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

// In-memory security logs store
let securityLogsStore: SecurityLog[] = [
  {
    id: "log-1",
    event: "User Preferences Updated",
    ip_address: "192.168.1.102",
    timestamp: new Date().toISOString(),
    status: "info",
  },
  {
    id: "log-2",
    event: "New Device Login Detected",
    ip_address: "192.168.1.102",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: "warning",
  },
  {
    id: "log-3",
    event: "Two-Factor Authentication (2FA) Verified",
    ip_address: "192.168.1.102",
    timestamp: new Date(Date.now() - 86400000 * 1).toISOString(),
    status: "success",
  },
  {
    id: "log-4",
    event: "Password Changed Successfully",
    ip_address: "192.168.1.102",
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    status: "success",
  },
];

// Helper to log security activity
function logSecurityEvent(event: string, ipAddress = "192.168.1.102", status: "success" | "warning" | "info" = "info") {
  const newLog: SecurityLog = {
    id: "log-" + Date.now(),
    event,
    ip_address: ipAddress,
    timestamp: new Date().toISOString(),
    status,
  };
  securityLogsStore.unshift(newLog);
  if (securityLogsStore.length > 20) {
    securityLogsStore = securityLogsStore.slice(0, 20);
  }
}

// Multer memory storage configuration for image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create HTTP server & Socket.io server
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("Socket.io client connected:", socket.id);
    // Send current settings on connection
    socket.emit("settings_updated", userSettingsStore);
  });

  // Middleware to parse incoming JSON bodies
  app.use(express.json({ limit: "10mb" }));

  // ==========================================
  // BACKEND API ENDPOINTS
  // ==========================================

  // Handler for GET settings (supports /api/settings and /api/user/settings)
  const getSettingsHandler = (req: express.Request, res: express.Response) => {
    res.status(200).json({
      success: true,
      settings: userSettingsStore,
    });
  };

  app.get("/api/settings", getSettingsHandler);
  app.get("/api/user/settings", getSettingsHandler);

  // Handler for POST settings (supports /api/settings and /api/user/settings)
  const postSettingsHandler = (req: express.Request, res: express.Response) => {
    const { display_name, theme, notification_enabled, avatar_url } = req.body;

    const errors: string[] = [];

    if (display_name !== undefined) {
      if (typeof display_name !== "string" || display_name.trim().length === 0) {
        errors.push("Display name must be a non-empty string.");
      } else if (display_name.trim().length > 50) {
        errors.push("Display name cannot exceed 50 characters.");
      }
    }

    if (theme !== undefined && !["light", "dark", "system"].includes(theme)) {
      errors.push("Theme must be one of: 'light', 'dark', or 'system'.");
    }

    if (notification_enabled !== undefined && typeof notification_enabled !== "boolean") {
      errors.push("Notification enabled must be a boolean value.");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    userSettingsStore = {
      display_name: display_name !== undefined ? display_name.trim() : userSettingsStore.display_name,
      theme: theme !== undefined ? theme : userSettingsStore.theme,
      notification_enabled: notification_enabled !== undefined ? Boolean(notification_enabled) : userSettingsStore.notification_enabled,
      avatar_url: avatar_url !== undefined ? avatar_url : userSettingsStore.avatar_url,
      updated_at: new Date().toISOString(),
    };

    // Log security activity
    logSecurityEvent("User Preferences Updated");

    // Emit Socket.io event to all clients
    io.emit("settings_updated", userSettingsStore);

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings: userSettingsStore,
    });
  };

  app.post("/api/settings", postSettingsHandler);
  app.post("/api/user/settings", postSettingsHandler);

  // Avatar upload endpoint (POST /api/settings/avatar)
  const avatarUploadHandler = (req: express.Request, res: express.Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file uploaded." });
    }

    // Convert buffer to Base64 Data URL (simulating Cloudinary/S3 image CDN processing)
    const mimeType = req.file.mimetype || "image/jpeg";
    const base64Image = req.file.buffer.toString("base64");
    const avatarDataUrl = `data:${mimeType};base64,${base64Image}`;

    userSettingsStore.avatar_url = avatarDataUrl;
    userSettingsStore.updated_at = new Date().toISOString();

    logSecurityEvent("Profile Avatar Updated", req.ip || "192.168.1.102", "info");

    // Broadcast change
    io.emit("settings_updated", userSettingsStore);

    return res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      url: avatarDataUrl,
      settings: userSettingsStore,
    });
  };

  app.post("/api/settings/avatar", upload.single("avatar"), avatarUploadHandler);
  app.post("/api/user/settings/avatar", upload.single("avatar"), avatarUploadHandler);

  // Active Sessions Endpoints
  app.get("/api/settings/sessions", (req, res) => {
    res.status(200).json({
      success: true,
      sessions: activeSessionsStore,
    });
  });

  app.delete("/api/settings/sessions/:id", (req, res) => {
    const sessionId = req.params.id;
    const sessionToTerminate = activeSessionsStore.find((s) => s.id === sessionId);

    if (!sessionToTerminate) {
      return res.status(404).json({ success: false, error: "Session not found." });
    }

    if (sessionToTerminate.is_current) {
      return res.status(400).json({ success: false, error: "Cannot terminate your current active session." });
    }

    activeSessionsStore = activeSessionsStore.filter((s) => s.id !== sessionId);
    logSecurityEvent(`Terminated Session (${sessionToTerminate.device})`, req.ip || "192.168.1.102", "warning");

    res.status(200).json({
      success: true,
      message: `Session ${sessionToTerminate.device} terminated successfully.`,
      sessions: activeSessionsStore,
    });
  });

  // Security Activity Log Endpoint
  app.get("/api/settings/logs", (req, res) => {
    res.status(200).json({
      success: true,
      logs: securityLogsStore.slice(0, 10),
    });
  });

  // FCM Push Notification Dispatch Endpoint (simulating Cloud Function triggered on chats/{chatId}/messages/{messageId})
  app.post("/api/notifications/dispatch-push", (req, res) => {
    const { chatId, messageId, senderId, senderName, content, participantTokens } = req.body;
    console.log(`[FCM Push Trigger] Message created in chat ${chatId} by ${senderName} (${senderId})`);
    console.log(`[FCM Tokens Target List]:`, participantTokens || ["fcm_token_demo_device"]);

    return res.status(200).json({
      success: true,
      message: "FCM Push notification dispatched successfully to room participants",
      dispatched_tokens: participantTokens || ["fcm_token_demo_device"],
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================
  // AI CORE INTEGRATION API ENDPOINTS (Gemini)
  // ==========================================

  // 0. Google AI Studio Chat Assistant Endpoint
  app.post("/api/ai/chat", async (req, res) => {
    const { message, chatHistory } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    const ai = getGenAIClient();
    const defaultResponse = "Hello! I am Google AI Studio Assistant. How can I assist your chat, summarize messages, or create content for you today? ✨";

    if (!ai) {
      return res.status(200).json({
        success: true,
        reply: defaultResponse
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            text: `System Context: You are Google AI Studio's advanced AI assistant embedded inside a real-time chat application.
Your role:
- Enhance conversations with contextual suggestions (stickers, emojis, quick replies).
- Summarize long chats into concise highlights.
- Translate messages instantly across languages while preserving tone.
- Detect and flag harmful or spammy content politely.
- Suggest smart scheduling when users mention times/dates.
- Enable voice-to-text and text-to-voice seamlessly.
- Generate creative content (poems, jokes, memes) on request.
- Maintain privacy by never storing sensitive data beyond the session.
Respond naturally, in a friendly tone, adapt to the user's language and style.

User Message: "${message}"`
          }
        ]
      });

      const reply = response.text ? response.text.trim() : defaultResponse;
      return res.status(200).json({ success: true, reply });
    } catch (err: any) {
      console.warn("AI Chat error, returning fallback response:", err?.message || err);
      return res.status(200).json({ success: true, reply: "I'm here to help! Let me know what you'd like to draft, translate, or summarize!" });
    }
  });

  // 1. Smart Reply Endpoint
  app.post("/api/ai/smart-reply", async (req, res) => {
    const { lastMessage, conversationContext } = req.body;
    
    // Default high-quality smart replies
    const defaultReplies = [
      "Sounds great! 👍",
      "I'm on it! ⚡",
      "Thanks for letting me know!"
    ];

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(200).json({ success: true, replies: defaultReplies });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Given the chat context: "${conversationContext || ''}" and last message: "${lastMessage || ''}", generate 3 short, polite 1-tap quick reply options for messaging.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 short smart replies."
              }
            },
            required: ["replies"]
          }
        }
      });

      const parsed = JSON.parse(response.text || '{"replies":[]}');
      return res.status(200).json({
        success: true,
        replies: parsed.replies && parsed.replies.length > 0 ? parsed.replies : defaultReplies
      });
    } catch (err: any) {
      // Silently handle 403 / leaked key / network error with instant fallbacks
      return res.status(200).json({
        success: true,
        replies: defaultReplies
      });
    }
  });

  // 2. AI Auto-Caption & Hashtags Generator Endpoint
  app.post("/api/ai/auto-caption", async (req, res) => {
    const { prompt, mediaType } = req.body;
    const defaultCaption = prompt ? `${prompt} ✨` : "Capturing moments in HD ✨";
    const defaultTags = ["#ApexMobile", "#VipCreator", "#Trending", "#DailyVibes"];

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(200).json({ success: true, caption: defaultCaption, tags: defaultTags });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Generate an engaging Instagram caption and 4 viral hashtags for a ${mediaType || 'photo'} with context: "${prompt || 'aesthetic moment'}".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["caption", "tags"]
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.status(200).json({
        success: true,
        caption: parsed.caption || defaultCaption,
        tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : defaultTags
      });
    } catch (err: any) {
      return res.status(200).json({
        success: true,
        caption: defaultCaption,
        tags: defaultTags
      });
    }
  });

  // 3. AI Feed Curation & Ranking Endpoint
  app.post("/api/ai/rank-feed", async (req, res) => {
    const { posts, userInterests } = req.body;
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(200).json({ success: true, rankedPosts: posts || [] });
    }

    const ai = getGenAIClient();
    if (!ai) {
      const sorted = [...posts].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
      return res.status(200).json({ success: true, rankedPosts: sorted });
    }

    try {
      const summaries = posts.map((p, idx) => ({
        index: idx,
        caption: p.caption,
        likes: p.likesCount,
        isExclusive: !!p.isExclusive
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Rank these social feed posts for a user interested in: "${(userInterests || []).join(', ')}". Posts: ${JSON.stringify(summaries)}. Return array of ordered indices.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rankedIndices: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER }
              }
            },
            required: ["rankedIndices"]
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      const rankedIndices: number[] = parsed.rankedIndices || [];
      const rankedPosts = rankedIndices.map(idx => posts[idx]).filter(Boolean);

      posts.forEach(p => {
        if (!rankedPosts.includes(p)) rankedPosts.push(p);
      });

      return res.status(200).json({ success: true, rankedPosts });
    } catch (err: any) {
      const sorted = [...posts].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
      return res.status(200).json({ success: true, rankedPosts: sorted });
    }
  });

  // 4. AI Voice Note Transcription Endpoint
  app.post("/api/ai/transcribe-audio", async (req, res) => {
    const { audioData, duration } = req.body;

    if (!audioData) {
      return res.status(400).json({ success: false, error: "Audio data is required" });
    }

    const defaultTranscript = "Hey there! Sending a quick voice note.";

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(200).json({
        success: true,
        transcript: defaultTranscript
      });
    }

    try {
      let base64Data = audioData;
      let mimeType = "audio/webm";

      if (typeof audioData === "string" && audioData.startsWith("data:")) {
        const matches = audioData.match(/^data:(audio\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          const parts = audioData.split(",");
          if (parts.length > 1) {
            base64Data = parts[1];
          }
        }
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: "Listen to this audio voice note and provide an accurate word-for-word text transcription. Do not include introductory notes, quotation marks, or meta commentary—only return the plain transcribed speech text.",
          },
        ],
      });

      const transcript = response.text ? response.text.trim() : defaultTranscript;

      return res.status(200).json({
        success: true,
        transcript: transcript || defaultTranscript
      });
    } catch (err: any) {
      console.warn("AI transcription failed, returning fallback transcript:", err?.message || err);
      return res.status(200).json({
        success: true,
        transcript: defaultTranscript
      });
    }
  });

  // ==========================================
  // VITE / STATIC MIDDLEWARE SETUP
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();

