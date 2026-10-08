import httpx
url = "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY_HERE"
r = httpx.get(url)
print(r.json())
