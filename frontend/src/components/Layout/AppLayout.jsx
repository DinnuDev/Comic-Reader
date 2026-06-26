import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import {
  BookOutlined,
  DatabaseOutlined,
  SettingOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import styles from './AppLayout.module.css';

const { Sider, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: '/', icon: <BookOutlined />, label: 'Library' },
    { key: '/sources', icon: <DatabaseOutlined />, label: 'Sources' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
  ];

  return (
    <Layout className={styles.layout}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        className={styles.sider}
        width={200}
      >
        <div className={styles.logo}>
          <ReadOutlined className={styles.logoIcon} />
          {!collapsed && <span className={styles.logoText}>ComicReader</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className={styles.menu}
        />
      </Sider>
      <Layout>
        <Content className={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
