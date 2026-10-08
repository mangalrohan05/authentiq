from app.services.openclip_service import cosine_similarity
import numpy as np

a = np.random.rand(512).astype(np.float32)
b = np.random.rand(512).astype(np.float32)
a = a / np.linalg.norm(a)
b = b / np.linalg.norm(b)

print(cosine_similarity(a.tolist(), b.tolist()))
print(cosine_similarity(a.tolist(), a.tolist()))
