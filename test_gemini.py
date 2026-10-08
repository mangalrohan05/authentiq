import httpx
import sys
url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
headers = {"Authorization": "Bearer YOUR_API_KEY_HERE", "Content-Type": "application/json"}
payload = {"model": "gemini-1.5-flash", "messages": [{"role": "user", "content": "hi"}]}
r = httpx.post(url, headers=headers, json=payload)
print(r.status_code, r.text)
