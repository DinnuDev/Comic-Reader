import React from 'react';
import { Progress, Space, Tag, Button } from 'antd';
import { HeartFilled, HeartOutlined, ReadOutlined } from '@ant-design/icons';
import { readerApi } from '../../services/api';
import styles from './ComicListItem.module.css';

export default function ComicListItem({ comic, onRead, onFavorite }) {
  const progress = comic.total_pages > 0
    ? Math.round((comic.current_page / comic.total_pages) * 100)
    : 0;

  const coverUrl = comic.cover_path || readerApi.getCoverUrl(comic.id);

  return (
    <div className={styles.item}>
      <img
        src={coverUrl}
        alt={comic.title}
        className={styles.cover}
        onClick={onRead}
        loading="lazy"
        onError={e => { e.target.src = ''; }}
      />
      <div className={styles.info} onClick={onRead}>
        <div className={styles.title}>{comic.title}</div>
        {comic.series && <div className={styles.meta}>{comic.series}</div>}
        <div className={styles.meta}>
          {comic.source_name && <Tag>{comic.source_name}</Tag>}
          {comic.page_count > 0 && <span>{comic.page_count} pages</span>}
        </div>
        {progress > 0 && (
          <Progress
            percent={progress}
            size="small"
            strokeColor="#e94560"
            showInfo={false}
            className={styles.progress}
          />
        )}
      </div>
      <div className={styles.actions}>
        <Button
          type="text"
          icon={comic.is_favorite ? <HeartFilled style={{ color: '#e94560' }} /> : <HeartOutlined />}
          onClick={e => { e.stopPropagation(); onFavorite(); }}
        />
        <Button type="primary" size="small" icon={<ReadOutlined />} onClick={onRead}>
          Read
        </Button>
      </div>
    </div>
  );
}
