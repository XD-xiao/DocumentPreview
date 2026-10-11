(function () {
  "use strict";

  // 文档清单（file 为仓库内文件名，展示名保持中文）
  const documents = [
    {
      id: "network",
      name: "计算机原组网总资料 预览25.5版",
      file: "network-preview.pdf"
    },
    {
      id: "c-algorithm",
      name: "C笔记+算法库26.4 水印预览版",
      file: "c-algorithm-preview.pdf"
    }
  ];

  // 使用本地打包的 worker，避免跨域与 CDN 延迟
  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  const docSelect = document.getElementById("doc-select");
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
  const btnBuy = document.getElementById("btn-buy");
  const buyModal = document.getElementById("buy-modal");

  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let currentScale = 1.0;
  let fitScale = null;
  let basePageWidth = null;
  let isFitMode = false;
  let currentFile = null;
  let renderTask = null;
  let loadId = 0;

  const SCALE_STEP = 0.1;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 3.0;
  const MOBILE_BREAKPOINT = 768;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // 渲染文档下拉框
  function renderDocSelect() {
    docSelect.innerHTML = "";
    documents.forEach((doc) => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.name;
      docSelect.appendChild(opt);
    });
  }

  function selectDocument(id) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    docSelect.value = id;
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
    viewerContainer.scrollTop = 0;

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
        basePageWidth = base.width;
        fitScale = clamp(availableWidth() / basePageWidth, SCALE_MIN, SCALE_MAX);
        // 移动端默认按宽度自适应，桌面端默认 100%
        isFitMode = window.innerWidth <= MOBILE_BREAKPOINT;
        currentScale = isFitMode ? fitScale : 1.0;
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

  function openModal() {
    buyModal.hidden = false;
  }

  function closeModal() {
    buyModal.hidden = true;
  }

  // 事件绑定
  docSelect.addEventListener("change", () => selectDocument(docSelect.value));
  btnPrev.addEventListener("click", () => goToPage(currentPage - 1));
  btnNext.addEventListener("click", () => goToPage(currentPage + 1));
  btnZoomIn.addEventListener("click", () => {
    isFitMode = false;
    setScale(currentScale + SCALE_STEP);
  });
  btnZoomOut.addEventListener("click", () => {
    isFitMode = false;
    setScale(currentScale - SCALE_STEP);
  });
  btnFit.addEventListener("click", () => {
    isFitMode = true;
    if (pdfDoc && fitScale) setScale(fitScale);
  });
  btnRetry.addEventListener("click", () => {
    if (currentFile) loadDocument(currentFile);
  });

  btnBuy.addEventListener("click", openModal);
  buyModal.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
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

  // 视口变化时重算适应宽度比例；处于适应宽度模式则自动重渲染（带防抖）
  let resizeTimer = null;
  function handleResize() {
    if (!pdfDoc || !basePageWidth) return;
    fitScale = clamp(availableWidth() / basePageWidth, SCALE_MIN, SCALE_MAX);
    if (!isFitMode) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setScale(fitScale), 150);
  }
  window.addEventListener("resize", handleResize);

  // 初始化
  renderDocSelect();
  selectDocument(documents[0].id);
})();
