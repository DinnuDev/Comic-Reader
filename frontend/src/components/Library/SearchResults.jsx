import React from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import ComicCard from './ComicCard';
import styles from './SearchResults.module.css';

const { Text } = Typography;

export default function SearchResults({ comics, query, onRead, onFavorite, onClear }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.heading}>
          Search results for <span className={styles.query}>"{query}"</span>
        </h2>
        <Button icon={<CloseOutlined />} type="text" onClick={onClear} className={styles.clearBtn}>
          Clear
        </Button>
      </div>
      {comics.length === 0 ? (
        <div className={styles.empty}>
          <Text type="secondary">No comics found matching "{query}"</Text>
        </div>
      ) : (
        <div className={styles.grid}>
          {comics.map(comic => (
            <ComicCard
              key={comic.id}
              comic={comic}
              onRead={() => onRead(comic.id)}
              onFavorite={() => onFavorite(comic.id)}
              size="lg"
            />
          ))}
        </div>
      )}
    </div>
  );
}
