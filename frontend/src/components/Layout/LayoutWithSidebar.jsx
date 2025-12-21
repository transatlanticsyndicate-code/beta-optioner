import React from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

function LayoutWithSidebar({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="w-full flex flex-1 flex-col">
        <header className="h-16 border-b border-border">
          <TopNav />
        </header>
        <main className="flex-1 overflow-auto p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}

export default LayoutWithSidebar;
