import { Heart } from 'lucide-react';
import { api } from '../api/client';
import LibraryView from '../components/LibraryView';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import type { Media } from '../types/media';

const fetchFavorites: PageFetcher = (page) =>
  api.listMedia({ is_favorite: true }, page).then((res) => ({ results: res.results, hasMore: !!res.next, count: res.count }));

const isFavorite = (m: Media) => m.is_favorite;

const EMPTY = {
  icon: <Heart size={48} />,
  title: 'No favorites yet',
  description: 'Tap the heart on a photo to see it here.',
};

const Favorites = () => {
  const collection = useMediaCollection(fetchFavorites);
  return (
    <LibraryView
      collection={collection}
      gridFilter={isFavorite}
      empty={EMPTY}
      header={
        <header className="page-header">
          <h1>Favorites</h1>
        </header>
      }
    />
  );
};

export default Favorites;
