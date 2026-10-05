import { useQuery } from '@tanstack/react-query';
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
  const { data: memories = [], isLoading } = useQuery<Memory[]>({
    queryKey: ['memories'],
    queryFn: () => api.getMemories(),
  });

  if (isLoading || memories.length === 0) return null;

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
              <h3 className="memory-title">{memory.title}</h3>
              <span className="memory-subtitle">{memory.subtitle}</span>
              <span className="memory-count">{memory.media_ids.length} photo{memory.media_ids.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MemoriesCarousel;
