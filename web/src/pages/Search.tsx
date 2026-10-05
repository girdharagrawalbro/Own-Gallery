import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '../api/client';
import LibraryView from '../components/LibraryView';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';

const SearchResults = ({ query }: { query: string }) => {
  const fetchPage = useMemo<PageFetcher>(
    () => (page) =>
      api.listMedia({ search: query }, page).then((res) => ({ results: res.results, hasMore: !!res.next, count: res.count })),
    [query],
  );
  const collection = useMediaCollection(fetchPage);
  const { count, initialLoading } = collection;

  return (
    <LibraryView
      collection={collection}
      empty={{
        icon: <SearchIcon size={48} />,
        title: 'No results found',
        description: `Nothing matched “${query}”. Try natural language like "photos of a red car" or "beach sunset".`,
      }}
      header={
        <header className="page-header">
          <h1>Search</h1>
          <p className="page-subtitle">
            {initialLoading || count === null
              ? `Searching for “${query}”…`
              : `${count.toLocaleString()} result${count === 1 ? '' : 's'} for “${query}”`}
          </p>
        </header>
      }
    />
  );
};

const Search = () => {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();

  if (!query) {
    return (
      <div className="empty-state">
        <SearchIcon size={48} />
        <h2>AI Search</h2>
        <p>Search using natural language, like "photos at the beach", "red car", or "birthday photos".</p>
      </div>
    );
  }

  // Remount per query so paging state starts fresh.
  return <SearchResults key={query} query={query} />;
};

export default Search;
