/**
 * PageHeader — Shared sticky header for non-game pages.
 *
 * Renders: folklore (gold, links to landing) | children | identity button
 * Sticky at top, consistent padding and font size.
 */

import React, { useState } from 'react';
import IdentityButton from './IdentityButton.jsx';
import LoginPanel from './LoginPanel.jsx';
import ProfileEditor from './ProfileEditor.jsx';

export default function PageHeader({ identity, children }) {
  const [showLogin, setShowLogin] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  return (
    <>
      <div
        className="text-sm flex justify-between items-center sticky top-0 z-10 px-6 py-2"
        style={{ color: 'var(--colour-dim)', backgroundColor: 'var(--colour-bg)' }}
      >
        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="cursor-pointer hover:opacity-80"
          style={{
            color: 'var(--colour-highlight)',
            background: 'none',
            border: 'none',
            font: 'inherit',
            fontSize: 'inherit',
            padding: 0,
          }}
        >
          folklore
        </button>
        <span className="flex items-center gap-2">
          {children}
          <IdentityButton identity={identity} onClick={() => setShowLogin(!showLogin)} />
        </span>
      </div>
      {showLogin && (
        <LoginPanel
          identity={identity}
          onClose={() => setShowLogin(false)}
          onEditProfile={() => setShowProfileEditor(true)}
        />
      )}
      {showProfileEditor && (
        <ProfileEditor
          identity={identity}
          onClose={() => setShowProfileEditor(false)}
        />
      )}
    </>
  );
}
