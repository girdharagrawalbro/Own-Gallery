import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import MediaViewer from './MediaViewer';
import type { Media } from '../types/media';

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

  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);

  const { data: memoryMedia = [] } = useQuery<Media[]>({
    queryKey: ['memory-media', selectedMemory?.id],
    queryFn: () => api.mediaStatus(selectedMemory!.media_ids),
    enabled: !!selectedMemory && selectedMemory.media_ids.length > 0,
  });

  if (isLoading || memories.length === 0) return null;

  return (
    <>
      <div className="memories-section">
        <div className="memories-header">
          <h2 className="memories-title">
            <Sparkles size={18} />
            Memories
          </h2>
        </div>
        <div className="memories-carousel">
          {memories.map((memory) => (
            <div key={memory.id} className="memory-card" onClick={() => {
              setSelectedMemory(memory);
              if (memory.media_ids.length > 0) {
                setSelectedMediaId(memory.media_ids[0]);
              }
            }}>
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

      {selectedMemory && selectedMediaId && memoryMedia.length > 0 && (
        <MediaViewer
          items={memoryMedia}
          currentId={selectedMediaId}
          onNavigate={setSelectedMediaId}
          onClose={() => {
            setSelectedMemory(null);
            setSelectedMediaId(null);
          }}
        />
      )}
    </>
  );
};

export default MemoriesCarousel;
