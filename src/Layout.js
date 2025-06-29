import React from 'react';
import Header from './Header';
import Footer from './Footer';


function Layout({ children }) {
  return (
    <div className="container">
      
      <main className="layout-main-content">
        {children} {/* This is where your page-specific content will be rendered */}
      </main>
      <Footer />
    </div>
  );
}

export default Layout;