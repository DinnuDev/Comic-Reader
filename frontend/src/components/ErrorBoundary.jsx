import React from 'react';
import { Button, Result } from 'antd';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d' }}>
          <Result
            status="error"
            title="Something went wrong"
            subTitle={this.state.error?.message || 'An unexpected error occurred.'}
            extra={[
              <Button key="reload" type="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>,
              <Button key="back" onClick={() => { this.setState({ error: null }); window.history.back(); }}>
                Go Back
              </Button>,
            ]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
