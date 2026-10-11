(function () {
  "use strict";

  // 文档清单（file 为仓库内英文文件名，展示名保持中文）
  const documents = [
    {
      id: "network",
      name: "计算机原组网总资料 预览25.5版",
      file: "network-preview.pdf",
      icon: "🌐"
    },
    {
      id: "c-algorithm",
      name: "C笔记+算法库26.4 水印预览版",
      file: "c-algorithm-preview.pdf",
      icon: "💻"
    }
  ];

  // 使用本地打包的 worker，避免跨域与 CDN 延迟
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  const docListEl = document.getElementById("doc-list");
  const canvas = document.getElementById("pdf-canvas");
  const loadingEl = document.getElementById("loading");
  const errorBox = document.getElementById("error-box");
  const errorMessage = document.getElementById("error-message");
  const viewerContainer = document.getElementById("viewer-container");

  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const pageInput = document.getElementById("page-input");
  const pageTotal = document.getElementById("page-total");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnFit = document.getElementById("btn-fit");
  const zoomLevel = document.getElementById("zoom-level");
  const btnDownload = document.getElementById("btn-download");
  const btnRetry = document.getElementById("btn-retry");

  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.0;
  let fitScale = null;
  let currentFile = null;
  let renderTask = null;
  let loadId = 0;

  const SCALE_STEP = 0.1;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 2.5;
  const MOBILE_BREAKPOINT = 768;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

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

    btnDownload.setAttribute("href", doc.file);
    btnDownload.setAttribute("download", doc.name + ".pdf");

    loadDocument(doc.file);
  }

  function loadDocument(file) {
    const id = ++loadId;
    currentFile = file;

    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }

    loadingEl.hidden = false;
    errorBox.hidden = true;
    canvas.style.display = "none";

    // disableAutoFetch: 只按需加载当前页，避免一次性下载整份大 PDF
    const task = pdfjsLib.getDocument({
      url: file,
      disableAutoFetch: true
    });

    task.promise
      .then((pdf) => {
        if (id !== loadId) {
          pdf.destroy();
          return;
        }
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        pageTotal.textContent = "/ " + totalPages;
        pageInput.max = totalPages;
        currentPage = 1;
        pageInput.value = 1;
        updateNavState();
        return pdf.getPage(1);
      })
      .then((page) => {
        if (id !== loadId) return;
        const base = page.getViewport({ scale: 1 });
        fitScale = clamp(availableWidth() / base.width, SCALE_MIN, SCALE_MAX);
        // 移动端默认按宽度自适应，桌面端默认 100%
        currentScale = window.innerWidth <= MOBILE_BREAKPOINT ? fitScale : 1.0;
        zoomLevel.textContent = Math.round(currentScale * 100) + "%";
        renderPage(1);
      })
      .catch((err) => {
        if (id !== loadId) return;
        console.error("加载 PDF 失败:", err);
        loadingEl.hidden = true;
        showError("文档加载失败，请检查网络后重试。");
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
        renderTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : null
        });
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
        showError("页面渲染失败，请重试。");
      });
  }

  function availableWidth() {
    const cs = getComputedStyle(viewerContainer);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return Math.max(200, viewerContainer.clientWidth - padX - 16);
  }

  function updateNavState() {
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;
  }

  function setScale(scale) {
    currentScale = clamp(scale, SCALE_MIN, SCALE_MAX);
    zoomLevel.textContent = Math.round(currentScale * 100) + "%";
    if (pdfDoc) renderPage(currentPage);
  }

  function goToPage(num) {
    if (!pdfDoc) return;
    const target = clamp(Math.round(num), 1, totalPages);
    if (target !== currentPage) {
      renderPage(target);
    } else {
      pageInput.value = target;
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBox.hidden = false;
  }

  // 事件绑定
  btnPrev.addEventListener("click", () => goToPage(currentPage - 1));
  btnNext.addEventListener("click", () => goToPage(currentPage + 1));
  btnZoomIn.addEventListener("click", () => setScale(currentScale + SCALE_STEP));
  btnZoomOut.addEventListener("click", () => setScale(currentScale - SCALE_STEP));
  btnFit.addEventListener("click", () => {
    if (pdfDoc && fitScale) setScale(fitScale);
  });
  btnRetry.addEventListener("click", () => {
    if (currentFile) loadDocument(currentFile);
  });

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
