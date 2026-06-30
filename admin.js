(function () {
  'use strict';

  // ============ State ============
  var config = null;
  var photos = [];
  var pending = [];
  var editingId = null;

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  var ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // ============ Helpers ============
  function $(id) { return document.getElementById(id); }

  function ghUrl(path) {
    return 'https://api.github.com/repos/' + config.owner + '/' + config.repo + '/contents/' + path;
  }

  function ghHeaders(extra) {
    var h = {
      'Authorization': 'Bearer ' + config.token,
      'Accept': 'application/vnd.github+json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function rawUrl(path) {
    return 'https://raw.githubusercontent.com/' + config.owner + '/' + config.repo + '/' + config.branch + '/' + path + '?t=' + Date.now();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast visible' + (isErr ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // ============ Login ============
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var token = $('token').value.trim();
    var owner = $('owner').value.trim();
    var repo = $('repo').value.trim();
    var branch = $('branch').value.trim() || 'main';
    if (!token || !owner || !repo) return;

    $('login-error').textContent = '';
    fetch('https://api.github.com/repos/' + owner + '/' + repo, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    }).then(function (res) {
      if (res.status === 401) throw new Error('Token 无效');
      if (res.status === 404) throw new Error('仓库不存在或 Token 无访问权限');
      if (!res.ok) throw new Error('登录失败: HTTP ' + res.status);
      config = { token: token, owner: owner, repo: repo, branch: branch };
      sessionStorage.setItem('photolog-config', JSON.stringify(config));
      showAdmin();
    }).catch(function (err) {
      $('login-error').textContent = err.message;
    });
  });

  function showAdmin() {
    $('login-view').classList.add('hidden');
    $('admin-view').classList.remove('hidden');
    loadPhotos();
  }

  function logout() {
    sessionStorage.removeItem('photolog-config');
    config = null;
    photos = [];
    pending = [];
    $('admin-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('login-form').reset();
  }

  $('logout-btn').addEventListener('click', logout);

  (function restore() {
    var saved = sessionStorage.getItem('photolog-config');
    if (!saved) return;
    try {
      config = JSON.parse(saved);
      showAdmin();
    } catch (e) { /* ignore */ }
  })();

  // ============ Load photos ============
  function loadPhotos() {
    return fetch(rawUrl('photos.json'), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return { photos: [] };
        return res.json();
      })
      .then(function (data) {
        photos = (data && data.photos) || [];
        renderPhotoGrid();
      })
      .catch(function () {
        photos = [];
        renderPhotoGrid();
      });
  }

  function renderPhotoGrid() {
    var grid = $('photo-grid');
    $('photo-count').textContent = photos.length ? photos.length + ' 张' : '';
    if (photos.length === 0) {
      grid.innerHTML = '<p class="empty">暂无照片，上传第一张吧</p>';
      return;
    }
    grid.innerHTML = photos.map(function (p) {
      var eq = [p.camera, p.lens].filter(Boolean).join(', ');
      return ''
        + '<div class="photo-card" data-id="' + escapeHtml(p.id) + '">'
        + '<div class="thumb" style="background-image:url(\'' + escapeHtml(rawUrl(p.path)) + '\')"></div>'
        + '<div class="card-meta">'
        + '<span class="card-date">' + escapeHtml(p.date || '—') + '</span>'
        + '<span class="card-eq">' + escapeHtml(eq) + '</span>'
        + '</div>'
        + '<div class="card-actions">'
        + '<button class="icon-btn" data-act="edit" title="编辑" type="button">' + ICON_EDIT + '</button>'
        + '<button class="icon-btn" data-act="delete" title="删除" type="button">' + ICON_DELETE + '</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  $('photo-grid').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var card = btn.closest('.photo-card');
    if (!card) return;
    var id = card.dataset.id;
    var photo = photos.find(function (p) { return p.id === id; });
    if (!photo) return;

    if (btn.dataset.act === 'edit') {
      openEdit(photo);
    } else if (btn.dataset.act === 'delete') {
      if (!confirm('确认删除这张照片？图片文件与元数据都将移除。')) return;
      deletePhoto(photo);
    }
  });

  // ============ Delete ============
  function deletePhoto(photo) {
    fetch(ghUrl(photo.path), { headers: ghHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error('无法读取文件信息');
        return res.json();
      })
      .then(function (info) {
        return fetch(ghUrl(photo.path), {
          method: 'DELETE',
          headers: ghHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            message: 'delete: ' + photo.filename,
            sha: info.sha,
            branch: config.branch
          })
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('删除图片失败');
        photos = photos.filter(function (p) { return p.id !== photo.id; });
        return savePhotosJson();
      })
      .then(function () {
        renderPhotoGrid();
        toast('已删除');
      })
      .catch(function (err) { toast(err.message, true); });
  }

  // ============ Save photos.json ============
  function savePhotosJson() {
    return fetch(ghUrl('photos.json'), { headers: ghHeaders() })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var sha = data ? data.sha : null;
        var content = utf8ToBase64(JSON.stringify({ photos: photos }, null, 2));
        return fetch(ghUrl('photos.json'), {
          method: 'PUT',
          headers: ghHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            message: 'update photos.json',
            content: content,
            branch: config.branch,
            sha: sha || undefined
          })
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (err) {
            throw new Error('保存元数据失败: ' + (err.message || res.status));
          });
        }
      });
  }

  // ============ Edit modal ============
  function openEdit(photo) {
    editingId = photo.id;
    $('edit-date').value = photo.date || '';
    $('edit-camera').value = photo.camera || '';
    $('edit-lens').value = photo.lens || '';
    $('edit-note').value = photo.note || '';
    $('edit-modal').classList.remove('hidden');
  }

  $('edit-cancel').addEventListener('click', function () {
    $('edit-modal').classList.add('hidden');
    editingId = null;
  });

  $('edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var photo = photos.find(function (p) { return p.id === editingId; });
    if (!photo) return;
    photo.date = $('edit-date').value;
    photo.camera = $('edit-camera').value;
    photo.lens = $('edit-lens').value;
    photo.note = $('edit-note').value;
    savePhotosJson()
      .then(function () {
        $('edit-modal').classList.add('hidden');
        editingId = null;
        renderPhotoGrid();
        toast('已保存');
      })
      .catch(function (err) { toast(err.message, true); });
  });

  // ============ Upload ============
  var fileInput = $('file-input');
  var dropZone = $('drop-zone');

  $('pick-btn').addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  function handleFiles(fileList) {
    var files = Array.prototype.filter.call(fileList, function (f) {
      return f.type.startsWith('image/');
    });
    files.forEach(function (file) {
      var item = {
        id: uuid(),
        file: file,
        date: '',
        camera: '',
        lens: '',
        note: '',
        previewUrl: URL.createObjectURL(file),
        parsing: true
      };
      pending.push(item);
      renderPending();
      parseExif(item);
    });
  }

  function parseExif(item) {
    if (!window.exifr) {
      item.parsing = false;
      updatePendingItem(item);
      return;
    }
    exifr.parse(item.file, { tiff: true, exif: true, ifd0: true, gps: false, interop: false, xmp: false, iptc: false })
      .then(function (exif) {
        if (exif) {
          if (exif.DateTimeOriginal) {
            var d = exif.DateTimeOriginal;
            item.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          }
          var make = exif.Make || '';
          var model = exif.Model || '';
          if (model) {
            var cleanModel = (make && model.startsWith(make)) ? model.slice(make.length).trim() : model;
            item.camera = [make, cleanModel].filter(Boolean).join(' ').trim();
          }
          if (exif.LensModel) item.lens = exif.LensModel;
        }
      })
      .catch(function () { /* ignore */ })
      .then(function () {
        item.parsing = false;
        updatePendingItem(item);
      });
  }

  function renderPending() {
    var list = $('pending-list');
    if (pending.length === 0) {
      list.innerHTML = '';
      $('upload-bar').classList.add('hidden');
      return;
    }
    list.innerHTML = pending.map(function (item) {
      return ''
        + '<div class="pending-item" data-id="' + item.id + '">'
        + '<div class="pending-thumb" style="background-image:url(\'' + item.previewUrl + '\')"></div>'
        + '<div class="pending-fields">'
        + '<label><span class="field-label">日期</span><input type="date" data-field="date" value="' + escapeHtml(item.date) + '" ' + (item.parsing ? 'disabled' : '') + '></label>'
        + '<label><span class="field-label">相机</span><input type="text" data-field="camera" value="' + escapeHtml(item.camera) + '" placeholder="' + (item.parsing ? '解析中…' : '可选') + '" ' + (item.parsing ? 'disabled' : '') + '></label>'
        + '<label><span class="field-label">镜头</span><input type="text" data-field="lens" value="' + escapeHtml(item.lens) + '" placeholder="' + (item.parsing ? '解析中…' : '可选') + '" ' + (item.parsing ? 'disabled' : '') + '></label>'
        + '<label><span class="field-label">注释</span><input type="text" data-field="note" value="' + escapeHtml(item.note) + '" placeholder="可选" ' + (item.parsing ? 'disabled' : '') + '></label>'
        + '</div>'
        + '<button class="icon-btn" data-act="remove" title="移除" type="button">' + ICON_DELETE + '</button>'
        + '</div>';
    }).join('');
    $('upload-bar').classList.remove('hidden');
  }

  function updatePendingItem(item) {
    var el = document.querySelector('.pending-item[data-id="' + item.id + '"]');
    if (!el) return;
    el.querySelectorAll('input[data-field]').forEach(function (input) {
      var field = input.dataset.field;
      input.disabled = false;
      if (document.activeElement !== input) {
        input.value = item[field] || '';
      }
      if (field === 'camera' || field === 'lens' || field === 'note') {
        input.placeholder = '可选';
      }
    });
  }

  $('pending-list').addEventListener('input', function (e) {
    var item = e.target.closest('.pending-item');
    if (!item) return;
    var id = item.dataset.id;
    var field = e.target.dataset.field;
    if (!field) return;
    var p = pending.find(function (x) { return x.id === id; });
    if (p) p[field] = e.target.value;
  });

  $('pending-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act="remove"]');
    if (!btn) return;
    var item = btn.closest('.pending-item');
    if (!item) return;
    var id = item.dataset.id;
    pending = pending.filter(function (x) { return x.id !== id; });
    renderPending();
  });

  $('upload-btn').addEventListener('click', uploadAll);

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function uploadAll() {
    if (pending.length === 0) return;
    var btn = $('upload-btn');
    btn.disabled = true;
    var newEntries = [];
    var total = pending.length;
    var failed = 0;

    var chain = Promise.resolve();
    pending.slice().forEach(function (item, i) {
      chain = chain.then(function () {
        btn.textContent = '上传中 ' + (i + 1) + '/' + total + '…';
        var ext = (item.file.name.split('.').pop() || 'jpg').toLowerCase();
        var shortId = uuid().slice(0, 8);
        var datePart = item.date || new Date().toISOString().slice(0, 10);
        var filename = datePart + '-' + shortId + '.' + ext;
        var path = 'photos/' + filename;
        return fileToBase64(item.file)
          .then(function (base64) {
            return fetch(ghUrl(path), {
              method: 'PUT',
              headers: ghHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                message: 'upload: ' + filename,
                content: base64,
                branch: config.branch
              })
            });
          })
          .then(function (res) {
            if (!res.ok) {
              return res.json().catch(function () { return {}; }).then(function (err) {
                throw new Error(err.message || 'HTTP ' + res.status);
              });
            }
            newEntries.push({
              id: item.id,
              filename: filename,
              path: path,
              date: item.date,
              camera: item.camera,
              lens: item.lens,
              note: item.note,
              uploadedAt: new Date().toISOString()
            });
          })
          .catch(function (err) {
            failed++;
            toast('"' + item.file.name + '" 上传失败: ' + err.message, true);
          });
      });
    });

    chain.then(function () {
      if (newEntries.length === 0) {
        btn.disabled = false;
        btn.textContent = '上传全部';
        return;
      }
      // Refresh photos list to get latest sha (avoid conflict with other edits)
      return fetch(rawUrl('photos.json'), { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : { photos: [] }; })
        .then(function (data) {
          photos = (data && data.photos) || [];
          photos.push.apply(photos, newEntries);
          return savePhotosJson();
        })
        .then(function () {
          pending = [];
          renderPending();
          renderPhotoGrid();
          toast('成功上传 ' + newEntries.length + ' 张' + (failed ? '，失败 ' + failed + ' 张' : ''));
        })
        .catch(function (err) {
          toast('图片已上传但元数据保存失败: ' + err.message, true);
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = '上传全部';
        });
    });
  }

  $('refresh-btn').addEventListener('click', function () {
    toast('刷新中…');
    loadPhotos();
  });
})();
