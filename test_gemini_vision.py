import httpx, json
url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
headers = {"Authorization": "Bearer YOUR_API_KEY_HERE", "Content-Type": "application/json"}
payload = {
    "model": "gemini-3.6-flash",
    "messages": [
        {"role": "user", "content": [{"type": "text", "text": "Return {\"status\": \"ok\"}"}]}
    ],
    "response_format": {"type": "json_object"}
}
r = httpx.post(url, headers=headers, json=payload)
print(r.status_code)
print(repr(r.text))
