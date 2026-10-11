(function () {
  "use strict";

  // 文档清单（file 需与仓库内 PDF 文件名完全一致）
  const documents = [
    {
      id: "network",
      name: "计算机原组网总资料 预览25.5版",
      file: "计算机原组网总资料  预览25.5版.pdf",
      icon: "🌐"
    },
    {
      id: "c-algorithm",
      name: "C笔记+算法库26.4 水印预览版",
      file: "C笔记+算法库26.4 水印预览版.pdf",
      icon: "💻"
    }
  ];

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const docListEl = document.getElementById("doc-list");
  const canvas = document.getElementById("pdf-canvas");
  const canvasWrap = document.getElementById("canvas-wrap");
  const loadingEl = document.getElementById("loading");
  const errorBox = document.getElementById("error-box");
  const viewerContainer = document.getElementById("viewer-container");

  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const pageInput = document.getElementById("page-input");
  const pageTotal = document.getElementById("page-total");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const zoomLevel = document.getElementById("zoom-level");
  const btnDownload = document.getElementById("btn-download");

  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.0;
  let renderTask = null;

  const SCALE_STEP = 0.1;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 2.5;

  // 渲染侧边栏文档列表
  function renderDocList() {
    docListEl.innerHTML = "";
    documents.forEach((doc) => {
      const li = document.createElement("li");
      li.className = "doc-item";
      li.dataset.id = doc.id;
      li.innerHTML =
        '<span class="doc-icon">' + doc.icon + "</span>" +
        '<div class="doc-name">' + doc.name + "</div>" +
        '<div class="doc-meta">PDF 文档</div>';
      li.addEventListener("click", () => selectDocument(doc.id));
      docListEl.appendChild(li);
    });
  }

  function selectDocument(id) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    document.querySelectorAll(".doc-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === id);
    });

    btnDownload.setAttribute("href", encodeURI(doc.file));
    btnDownload.setAttribute("download", doc.name + ".pdf");

    loadDocument(doc.file);
  }

  function loadDocument(url) {
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    loadingEl.hidden = false;
    errorBox.hidden = true;
    canvas.style.display = "none";

    const loadingTask = pdfjsLib.getDocument(encodeURI(url));
    loadingTask.promise
      .then((pdf) => {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        pageTotal.textContent = "/ " + totalPages;
        pageInput.max = totalPages;
        currentPage = 1;
        pageInput.value = currentPage;
        updateNavState();
        renderPage(currentPage);
      })
      .catch((err) => {
        console.error("加载 PDF 失败:", err);
        loadingEl.hidden = true;
        errorBox.hidden = false;
      });
  }

  function renderPage(num) {
    if (!pdfDoc) return;

    if (renderTask) {
      renderTask.cancel();
    }

    loadingEl.hidden = false;
    errorBox.hidden = true;

    pdfDoc
      .getPage(num)
      .then((page) => {
        const viewport = page.getViewport({ scale: currentScale });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const ctx = canvas.getContext("2d");
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : null
        };

        renderTask = page.render(renderContext);
        return renderTask.promise;
      })
      .then(() => {
        loadingEl.hidden = true;
        canvas.style.display = "block";
        currentPage = num;
        pageInput.value = num;
        updateNavState();
      })
      .catch((err) => {
        if (err && err.name === "RenderingCancelledException") {
          return;
        }
        console.error("渲染页面失败:", err);
        loadingEl.hidden = true;
      });
  }

  function updateNavState() {
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;
  }

  function setScale(scale) {
    currentScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
    zoomLevel.textContent = Math.round(currentScale * 100) + "%";
    if (pdfDoc) renderPage(currentPage);
  }

  function goToPage(num) {
    if (!pdfDoc) return;
    const target = Math.min(totalPages, Math.max(1, num));
    if (target !== currentPage) {
      renderPage(target);
    } else {
      pageInput.value = target;
    }
  }

  // 事件绑定
  btnPrev.addEventListener("click", () => goToPage(currentPage - 1));
  btnNext.addEventListener("click", () => goToPage(currentPage + 1));
  btnZoomIn.addEventListener("click", () => setScale(currentScale + SCALE_STEP));
  btnZoomOut.addEventListener("click", () => setScale(currentScale - SCALE_STEP));

  pageInput.addEventListener("change", () => {
    const val = parseInt(pageInput.value, 10);
    if (!isNaN(val)) goToPage(val);
  });

  pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pageInput.blur();
    }
  });

  // 初始化
  renderDocList();
  selectDocument(documents[0].id);
})();
