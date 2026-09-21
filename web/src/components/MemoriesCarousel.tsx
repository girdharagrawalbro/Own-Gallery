import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Sparkles } from 'lucide-react';

export interface Memory {
  id: string;
  title: string;
  subtitle: string;
  cover_url: string | null;
  media_ids: number[];
}

const MemoriesCarousel = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMemories()
      .then(setMemories)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || memories.length === 0) return null;

  return (
    <div className="memories-section">
      <div className="memories-header">
        <h2 className="memories-title">
          <Sparkles size={18} />
          Memories
        </h2>
        <button className="memories-view-all">View all</button>
      </div>
      <div className="memories-carousel">
        {memories.map((memory) => (
          <div key={memory.id} className="memory-card">
            {memory.cover_url && (
              <img src={memory.cover_url} alt={memory.title} className="memory-cover" loading="lazy" />
            )}
            <div className="memory-overlay">
              <span className="memory-subtitle">{memory.subtitle}</span>
              <h3 className="memory-name">{memory.title}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MemoriesCarousel;
