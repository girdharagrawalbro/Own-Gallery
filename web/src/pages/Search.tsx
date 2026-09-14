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
        title: 'No results',
        description: `Nothing matched “${query}”. Try a file name, a year like 2024, or a month like September.`,
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
        <h2>Search your library</h2>
        <p>Search by file name, a year (2024) or a month (September).</p>
      </div>
    );
  }

  // Remount per query so paging state starts fresh.
  return <SearchResults key={query} query={query} />;
};

export default Search;
