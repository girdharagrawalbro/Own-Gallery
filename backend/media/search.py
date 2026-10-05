import numpy as np
import logging
import re
from sentence_transformers import SentenceTransformer
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Lazy load model
_clip_model = None

def get_clip_model():
    global _clip_model
    if _clip_model is None:
        logger.info("Loading CLIP model (clip-ViT-B-32) for semantic search...")
        # clip-ViT-B-32 maps text & images to 512D vectors
        _clip_model = SentenceTransformer('clip-ViT-B-32')
    return _clip_model

def embed_text(text: str) -> np.ndarray:
    model = get_clip_model()
    # Normalize embedding for cosine similarity via dot product
    emb = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return emb

def embed_image(image_bytes: bytes) -> np.ndarray:
    model = get_clip_model()
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    emb = model.encode(img, convert_to_numpy=True, normalize_embeddings=True)
    return emb

def perform_semantic_search(query: str, queryset, user):
    """
    1. Extract people names if possible.
    2. Embed remaining query.
    3. Filter queryset.
    """
    from people.models import Person

    # 1. Very basic person extraction
    # Look for names of people the user has named.
    # Ex: "photos with Girdhar and Mom at the beach" -> matches "Girdhar", "Mom"
    persons = list(Person.objects.filter(user=user).exclude(name=""))
    matched_person_ids = []
    
    # Simple token/substring matching
    query_lower = query.lower()
    clean_query = query_lower
    for p in persons:
        name_lower = p.name.lower()
        if name_lower in clean_query:
            matched_person_ids.append(p.id)
            # Remove name from query to let CLIP focus on the rest
            clean_query = clean_query.replace(name_lower, "")
            
    # Remove common connector words that might be left over
    clean_query = re.sub(r'\b(with|and|of|photos|pictures|images|taken)\b', '', clean_query).strip()

    # If they matched people, filter the queryset by those people
    if matched_person_ids:
        # A photo must contain ALL matched people? Or ANY? Usually ANY or ALL depending on intent.
        # "Girdhar and Mom" -> usually implies both. Let's do ALL.
        for pid in matched_person_ids:
            queryset = queryset.filter(faces__person_id=pid)

    # If nothing left in query (e.g. they just searched "photos with Mom"), return just the filtered queryset
    if not clean_query.strip():
        return queryset.distinct()

    # 2. Semantic Search on remaining queryset
    # Only consider media that have a clip_embedding
    media_items = list(queryset.exclude(clip_embedding__isnull=True).values("id", "clip_embedding"))
    if not media_items:
        return queryset.none()

    # Embed text query
    text_emb = embed_text(clean_query) # 512D
    
    # Prepare matrix
    ids = np.array([m["id"] for m in media_items])
    # clip_embedding is stored as a list of floats in JSON
    embeddings = np.array([m["clip_embedding"] for m in media_items])
    
    # Dot product (since embeddings are normalized, this is cosine similarity)
    scores = np.dot(embeddings, text_emb)
    
    # Sort by score descending
    # Let's set a reasonable threshold, e.g. 0.22 for CLIP ViT-B-32 text-image similarity.
    THRESHOLD = 0.21
    
    valid_indices = np.where(scores > THRESHOLD)[0]
    
    if len(valid_indices) == 0:
        return queryset.none()
        
    valid_ids = ids[valid_indices]
    valid_scores = scores[valid_indices]
    
    # Sort valid_ids by score descending
    sorted_indices = np.argsort(-valid_scores)
    sorted_ids = valid_ids[sorted_indices]
    
    # Need to return a queryset that preserves this order.
    from django.db.models import Case, When
    preserved_order = Case(*[When(pk=pk, then=pos) for pos, pk in enumerate(sorted_ids)])
    
    return queryset.filter(id__in=sorted_ids).order_by(preserved_order)
