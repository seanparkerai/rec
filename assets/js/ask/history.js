// ask/history.js — conversation list backed by storage/ask.js. Opens a native
// <dialog> listing the household's threads with switch / rename / delete, plus a
// "New chat" action. Uses <dialog> (not window.confirm/prompt) per CLAUDE.md §11.

import {
  listAskConversations, deleteAskConversation, saveAskConversation,
} from '../storage.js';

export function createHistory({ openBtn, dialog, listEl, newBtn, closeBtn }, { onSwitch, onNew, getCurrentId }) {
  // Cache-first list (storage 9.3): render() runs once with the cached copy,
  // and again via the onUpdate callback if background revalidation differs.
  async function refresh() {
    render(await listAskConversations(render));
  }

  function render(convos) {
    listEl.replaceChildren();
    if (!convos.length) {
      const empty = document.createElement('p');
      empty.className = 'ask-history__empty';
      empty.textContent = 'No saved conversations yet.';
      listEl.appendChild(empty);
      return;
    }
    const currentId = getCurrentId?.();
    for (const c of convos) {
      listEl.appendChild(row(c, c.id === currentId));
    }
  }

  function row(convo, isCurrent) {
    const li = document.createElement('li');
    li.className = 'ask-history__row';
    if (isCurrent) li.dataset.current = 'true';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'ask-history__open';
    open.textContent = convo.title || 'Untitled chat';
    open.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    open.addEventListener('click', () => { dialog.close(); onSwitch(convo.id); });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'ask-history__action';
    rename.setAttribute('aria-label', `Rename ${convo.title || 'chat'}`);
    rename.textContent = 'Rename';
    rename.addEventListener('click', () => startRename(li, open, convo));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ask-history__action ask-history__action--danger';
    del.setAttribute('aria-label', `Delete ${convo.title || 'chat'}`);
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      del.disabled = true;
      await deleteAskConversation(convo.id);
      if (convo.id === getCurrentId?.()) onNew();
      refresh();
    });

    li.append(open, rename, del);
    return li;
  }

  function startRename(li, openBtn, convo) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ask-history__rename';
    input.value = convo.title || '';
    input.setAttribute('aria-label', 'New conversation title');
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const title = input.value.trim() || 'Untitled chat';
      await saveAskConversation(convo.id, { title });
      convo.title = title;
      openBtn.textContent = title;
      if (input.isConnected) input.replaceWith(openBtn);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { committed = true; input.replaceWith(openBtn); } // cancel, no save
    });
    input.addEventListener('blur', commit);
    openBtn.replaceWith(input);
    input.focus();
    input.select();
  }

  openBtn?.addEventListener('click', async () => { await refresh(); dialog.showModal(); });
  closeBtn?.addEventListener('click', () => dialog.close());
  newBtn?.addEventListener('click', () => { dialog.close?.(); onNew(); });
  // Click the backdrop to dismiss.
  dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  return { refresh };
}
