``` tab deepseek
[DeepSeek Watcher] 🔄 Rescanning due to new content... sandbox eval code:224:15
[DeepSeek Watcher] Already injected, skipping... sandbox eval code:6:13
[DeepSeek Watcher] 🔍 Scanning for AI response groups... Found: 0 sandbox eval code:78:13
[DeepSeek Watcher] 🔄 Rescanning due to new content... sandbox eval code:224:15
[DeepSeek Watcher] 🔍 Scanning for AI response groups... Found: 1 sandbox eval code:78:13
[DeepSeek Watcher] ✅ Attaching PURE DOM listener to COPY button (Group: 0, Button: 0) sandbox eval code:92:19
[DeepSeek Watcher] 🚩 Auto-click marker set sandbox eval code:156:13
[DeepSeek Watcher] 🖱️  COPY BUTTON CLICKED! Auto: true sandbox eval code:96:21
[DeepSeek Watcher] 🔍 Using DOM extraction... sandbox eval code:99:21
[DeepSeek Watcher] 🔍 Extracting AI response from DOM... sandbox eval code:23:15
[DeepSeek Watcher] ✅ Extracted 54381 chars from DOM sandbox eval code:62:17
[DeepSeek Watcher] ✅ CAPTURED from auto_click_dom_extraction sandbox eval code:177:13
[DeepSeek Watcher] 📊 Length: 54381 chars sandbox eval code:178:13
[DeepSeek Watcher] 📄 Sample: You are Cline, a highly skilled software engineer with extensive knowledge in many programming langu... sandbox eval code:179:13
document.execCommand(‘cut’/‘copy’) was denied because it was not called from inside a short running user-generated event handler. main.c25404cc88.js:1:294429
[DeepSeek Watcher] 📤 Message sent successfully sandbox eval code:194:19
[DeepSeek Watcher] 🚩 Auto-click marker cleared
```

``` extension log
[ServiceWorker] 🆕 New DeepSeek tab detected: 7 serviceWorker.js:273:835
[ServiceWorker] 📌 Tab title: DeepSeek - Into the Unknown serviceWorker.js:273:901
[ServiceWorker] ✅ PURE DOM clipboard watcher injected into tab 7 serviceWorker.js:273:19
[PromptController] ⚠️ No JSON pattern found in result serviceWorker.js:30:18920
[ServiceWorker] 🎉 CLIPBOARD CAPTURED! serviceWorker.js:433:3853
[ServiceWorker] 📍 Source: auto_click_dom_extraction serviceWorker.js:433:3907
[ServiceWorker] 📊 Length: 54381 chars serviceWorker.js:433:3954
[ServiceWorker] ⏰ Timestamp: 2025-11-21T07:17:19.637Z serviceWorker.js:433:4007
[ServiceWorker] 📄 First 500 chars: serviceWorker.js:433:4080
You are Cline, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool u serviceWorker.js:433:4131
[ServiceWorker] 📄 Last 100 chars: serviceWorker.js:433:4163
e.

# Context Window Usage
0 / 128K tokens used (0%)

# Current Mode
ACT MODE
</environment_details> serviceWorker.js:433:4213
[ServiceWorker] 💾 Stored clipboard capture with key: clipboardCapture_1763709439637 serviceWorker.js:433:4364
[PromptController] ✅ AI Copy button clicked successfully for tab 7 serviceWorker.js:30:20811
[PromptController] 📋 Copy button clicked: true
```

``` manually click vào button icon copy
[DeepSeek Watcher] 🖱️  COPY BUTTON CLICKED! Auto: false sandbox eval code:96:21
[DeepSeek Watcher] 🔍 Using DOM extraction... sandbox eval code:99:21
[DeepSeek Watcher] 🔍 Extracting AI response from DOM... sandbox eval code:23:15
[DeepSeek Watcher] ✅ Extracted 54381 chars from DOM sandbox eval code:62:17
[DeepSeek Watcher] ✅ CAPTURED from manual_click_dom_extraction sandbox eval code:177:13
[DeepSeek Watcher] 📊 Length: 54381 chars sandbox eval code:178:13
[DeepSeek Watcher] 📄 Sample: You are Cline, a highly skilled software engineer with extensive knowledge in many programming langu... sandbox eval code:179:13
[DeepSeek Watcher] 📤 Message sent successfully
```

lỗi bây giờ auto hay manually khi click vào button icon copy của AI lại copy message của user?