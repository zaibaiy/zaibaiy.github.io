(function () {
  'use strict';

  var DURATION = 9000;
  var photos = [];
  var queue = [];
  var queueIndex = 0;
  var currentLayer = 'a';
  var advanceTimer = null;

  var layerA = document.getElementById('layer-a');
  var layerB = document.getElementById('layer-b');
  var metaBar = document.getElementById('meta-bar');
  var emptyStage = document.getElementById('empty-stage');
  var ringFg = document.getElementById('ring-fg');
  var progressLine = document.querySelector('.progress-line');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function loadPhotos() {
    return fetch('photos.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return { photos: [] };
        return res.json();
      })
      .then(function (data) {
        photos = (data && data.photos) || [];
        return photos.length > 0;
      })
      .catch(function () {
        photos = [];
        return false;
      });
  }

  function updateMeta(photo) {
    var segments = [];
    if (photo.date) segments.push(photo.date);
    var equipment = [photo.camera, photo.lens].filter(Boolean).join(', ');
    if (equipment) segments.push(equipment);
    if (photo.note) segments.push(photo.note);

    metaBar.classList.remove('visible');
    setTimeout(function () {
      var html = segments.map(function (seg, i) {
        if (i === 0) return '<span class="meta-seg">' + escapeHtml(seg) + '</span>';
        return '<span class="meta-sep">·</span><span class="meta-seg">' + escapeHtml(seg) + '</span>';
      }).join('');
      metaBar.innerHTML = html;
      if (segments.length > 0) metaBar.classList.add('visible');
    }, 500);
  }

  function startProgress() {
    ringFg.classList.remove('animating');
    progressLine.classList.remove('animating');
    void ringFg.offsetWidth;
    ringFg.classList.add('animating');
    progressLine.classList.add('animating');
  }

  function showPhoto(photo) {
    var nextLayer = currentLayer === 'a' ? 'b' : 'a';
    var nextEl = nextLayer === 'a' ? layerA : layerB;
    var currEl = currentLayer === 'a' ? layerA : layerB;

    nextEl.onload = function () {
      nextEl.classList.add('active');
      currEl.classList.remove('active');
      currentLayer = nextLayer;
      updateMeta(photo);
      startProgress();
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(advance, DURATION);
    };
    nextEl.onerror = function () {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(advance, 600);
    };
    nextEl.src = photo.path;
  }

  function advance() {
    if (photos.length === 0) return;
    if (queue.length === 0 || queueIndex >= queue.length) {
      queue = shuffle(photos);
      queueIndex = 0;
    }
    var photo = queue[queueIndex++];
    showPhoto(photo);
  }

  function init() {
    loadPhotos().then(function (hasPhotos) {
      if (!hasPhotos) {
        emptyStage.classList.remove('hidden');
        return;
      }
      emptyStage.classList.add('hidden');
      advance();
    });
  }

  init();
})();
