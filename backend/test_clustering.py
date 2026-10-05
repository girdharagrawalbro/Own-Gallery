import numpy as np
from people.models import Face, Person
from sklearn.cluster import DBSCAN

faces = list(Face.objects.filter(media__is_deleted=False).order_by("id"))
print(f"Total faces: {len(faces)}")
if len(faces) == 0:
    print("No faces found")
    exit()

embeddings = np.array([f.embedding for f in faces])

for eps in [0.35, 0.4, 0.45, 0.5, 0.55, 0.6]:
    db = DBSCAN(eps=eps, min_samples=2, metric="euclidean", n_jobs=-1).fit(embeddings)
    labels = db.labels_
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    
    # Check max cluster size
    if n_clusters > 0:
        counts = [list(labels).count(l) for l in set(labels) if l != -1]
        max_cluster = max(counts)
    else:
        max_cluster = 0
        
    print(f"EPS: {eps:.2f} -> Clusters: {n_clusters}, Noise: {n_noise}, Max Cluster Size: {max_cluster}")
