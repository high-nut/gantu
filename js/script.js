//console.log("所有plus api都应该在此事件发生后调用，否则会出现plus is undefined。")
document.getElementById('imageInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('editableImage');
            img.src = e.target.result;
            document.getElementById('editorContainer').classList.remove('hidden');
            setupImageControls(img);
        };
        reader.readAsDataURL(file);
    }
});

function setupImageControls(img) {
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let startX, startY;
    let selectedRegions = []; // 定义 selectedRegions 变量


    
    // 创建一个临时的 canvas 用于存储图片的原始内容
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    img.addEventListener('load', function() {
        // 设置 tempCanvas 的尺寸与 image 的原始尺寸一致
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        tempCtx.drawImage(img, 0, 0);

        // 获取 editableImage 的实际尺寸
        const editableImage = document.getElementById('editableImage');
        const imageWidth = editableImage.clientWidth;
        const imageHeight = editableImage.clientHeight;

        const scaleX = imageWidth / img.naturalWidth;
        const scaleY = imageHeight / img.naturalHeight;
        const scale = Math.min(scaleX, scaleY);
        const scaledWidth = img.naturalWidth * scale;
        const scaledHeight = img.naturalHeight * scale;

        const offsetX = (imageWidth - scaledWidth) / 2;
        const offsetY = (imageHeight - scaledHeight) / 2;

        // 设置 canvas 的尺寸与图片的实际尺寸一致
        const canvas = document.getElementById('drawingCanvas');
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;

        // 设置 canvas 的样式，使其与图片的位置一致
        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;
        canvas.style.left = `${offsetX}px`;
        canvas.style.top = `${offsetY}px`;

        redrawSelectedRegions();
    });

// 定义一个函数来调整 canvas 的尺寸和位置
function adjustCanvas() {
    // 获取 editableImage 的实际尺寸
    const imageWidth = editableImage.clientWidth;
    const imageHeight = editableImage.clientHeight;

    // 获取 imageContainer 的尺寸
    const containerWidth = imageContainer.clientWidth;
    const containerHeight = imageContainer.clientHeight;

    // 计算图片的实际位置和缩放比例
    const scaleX = imageWidth / img.naturalWidth;
    const scaleY = imageHeight / img.naturalHeight;
    const scale = Math.min(scaleX, scaleY);
    const scaledWidth = img.naturalWidth * scale;
    const scaledHeight = img.naturalHeight * scale;

    const offsetX = (imageWidth - scaledWidth) / 2;
    const offsetY = (imageHeight - scaledHeight) / 2;

    // 设置 canvas 的尺寸与图片的实际尺寸一致
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    // 设置 canvas 的样式，使其与图片的位置一致
    canvas.style.width = `${scaledWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;
}

// 在图片加载完成后调整 canvas
img.addEventListener('load', function() {
    adjustCanvas();
});



// 使用 ResizeObserver 监听 body 的尺寸变化
const body = document.body;
const bodyObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        if (entry.contentBoxSize) {
            // 浏览器支持 contentBoxSize
            const contentBoxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
            body.clientWidth = contentBoxSize.inlineSize;
            body.clientHeight = contentBoxSize.blockSize;
        } else {
            // 浏览器不支持 contentBoxSize
            body.clientWidth = entry.contentRect.width;
            body.clientHeight = entry.contentRect.height;
        }
        adjustCanvas();
    }
});

bodyObserver.observe(body);

    // 鼠标事件
    img.addEventListener('mousedown', function(e) {
        if (brushMode === 'inactive') {
            console.log('mousedown on image');
            isDragging = true;
            startX = e.clientX - offsetX;
            startY = e.clientY - offsetY;
        }
    });

    img.addEventListener('mousemove', function(e) {
        if (isDragging && brushMode === 'inactive') {
            console.log('mousemove on image');
            offsetX = e.clientX - startX;
            offsetY = e.clientY - startY;
            img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            redrawSelectedRegions();
        }
    });

    img.addEventListener('mouseup', function(e) {
        if (brushMode === 'inactive') {
            console.log('mouseup on image');
            isDragging = false;
        }
    });

    img.addEventListener('mouseleave', function(e) {
        if (brushMode === 'inactive') {
            console.log('mouseleave on image');
            isDragging = false;
        }
    });

    // 触摸事件
    img.addEventListener('touchstart', function(e) {
        if (brushMode === 'inactive') {
            e.preventDefault();
            console.log('touchstart on image');
            isDragging = true;
            startX = e.touches[0].clientX - offsetX;
            startY = e.touches[0].clientY - offsetY;
        }
    });

    img.addEventListener('touchmove', function(e) {
        if (isDragging && brushMode === 'inactive') {
            e.preventDefault();
            console.log('touchmove on image');
            offsetX = e.touches[0].clientX - startX;
            offsetY = e.touches[0].clientY - startY;
            img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            redrawSelectedRegions();
        }
    });

    img.addEventListener('touchend', function(e) {
        if (brushMode === 'inactive') {
            console.log('touchend on image');
            isDragging = false;
        }
    });

    img.addEventListener('touchcancel', function(e) {
        if (brushMode === 'inactive') {
            console.log('touchcancel on image');
            isDragging = false;
        }
    });

    document.getElementById('zoomIn').addEventListener('click', function() {
        console.log('zoomIn');
        scale += 0.1;
        img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        redrawSelectedRegions();
    });

    document.getElementById('zoomOut').addEventListener('click', function() {
        console.log('zoomOut');
        scale -= 0.1;
        img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        redrawSelectedRegions();
    });

    // 涂抹选中和涂抹删除按钮
    const brushSelectButton = document.getElementById('brushSelect');
    const brushDeleteButton = document.getElementById('brushDelete');
    const lineWidthInput = document.getElementById('lineWidth');
    const lineWidthRange = document.getElementById('lineWidthRange');
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');

    let isDrawing = false;
    let brushMode = 'inactive'; // 初始状态为'inactive'

        // 同步输入框和拖动条的值
        lineWidthInput.addEventListener('input', function() {
            lineWidthRange.value = lineWidthInput.value;
        });
    
        lineWidthRange.addEventListener('input', function() {
            lineWidthInput.value = lineWidthRange.value;
        });

    function toggleButton(button) {
        if (button.classList.contains('active')) {
            button.classList.remove('active');
            brushMode = 'inactive'; // 设置为'inactive'
        } else {
            // 确保只有一个按钮处于 active 状态
            brushSelectButton.classList.remove('active');
            brushDeleteButton.classList.remove('active');
            button.classList.add('active');
            if (button === brushSelectButton) {
                brushMode = 'select';
            } else if (button === brushDeleteButton) {
                brushMode = 'delete';
            }
        }
        console.log('brushMode:', brushMode); // 添加调试信息

        // 动态设置 pointer-events 属性
        if (brushMode === 'inactive') {
            canvas.style.pointerEvents = 'none';
        } else if (brushMode === 'select' || brushMode === 'delete') {
            canvas.style.pointerEvents = 'auto';
        }
    }

    // 确保按钮事件只绑定一次
    brushSelectButton.addEventListener('click', function() {
        toggleButton(brushSelectButton);
    }, { once: false });

    brushDeleteButton.addEventListener('click', function() {
        toggleButton(brushDeleteButton);
    }, { once: false });

    // 重绘选中的区域
    function redrawSelectedRegions() {
        // 清除 canvas
        //ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 保存当前 canvas 状态
        ctx.save();

        // 应用缩放和偏移
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // 绘制 selectedRegions
        selectedRegions.forEach(region => {
            ctx.beginPath();
            ctx.moveTo(region[0].x, region[0].y);
            for (let i = 1; i < region.length; i++) {
                ctx.lineTo(region[i].x, region[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        });

        // 恢复 canvas 状态
        ctx.restore();
    }

    // 绘制逻辑
    function startDrawing(e) {
        if (brushMode === 'select' || brushMode === 'delete') {
            console.log('startDrawing');
            isDrawing = true;
            [lastX, lastY] = getCoordinates(e);
            draw(e);
        }
    }

    function draw(e) {
        if (!isDrawing) return; // 如果用户没有在画板上绘制，则不执行任何操作
        ctx.beginPath(); // 开始绘制新的路径或线段

        // 启用橡皮擦功能globalCompositeOperation
        if (brushMode === 'delete') {
            ctx.globalCompositeOperation = "destination-out";
        } else if (brushMode === 'select') {
            ctx.globalCompositeOperation = "source-over";
        }

        ctx.lineCap = "round"; // 比默认butt要涂的更干净
        ctx.moveTo(lastX, lastY); // 将画笔移动到上一个点的位置
        ctx.lineTo(getCoordinates(e)[0], getCoordinates(e)[1]); // 将画笔移动到当前鼠标位置，并创建一条线段连接这两个点
        ctx.strokeStyle = 'rgba(255, 0, 0, 1)'; // 设置线条的颜色为红色
        ctx.lineWidth = parseInt(lineWidthInput.value, 10); // 设置线条的宽度为lineWidth变量的值
        ctx.stroke(); // 绘制线条（执行上一步设置的线条属性）
        [lastX, lastY] = getCoordinates(e); // 更新上一个点的坐标为当前鼠标位置，以便下次绘制时使用正确的起点
    }

    function stopDrawing() {
        if (isDrawing) {
            console.log('stopDrawing');
            isDrawing = false;
        }
    }

    // 获取坐标
    function getCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        let x, y;

        if (e.type === 'mousedown' || e.type === 'mousemove') {
            x = (e.clientX - rect.left) / scale;
            y = (e.clientY - rect.top) / scale;
        } else if (e.type === 'touchstart' || e.type === 'touchmove') {
            x = (e.touches[0].clientX - rect.left) / scale;
            y = (e.touches[0].clientY - rect.top) / scale;
        } else {
            console.error('Unknown event type:', e.type);
            return;
        }

        return [x, y];
    }

    // 鼠标事件
    canvas.addEventListener('mousedown', function(e) {
        if (brushMode === 'select' || brushMode === 'delete') {
            startDrawing(e);
        }
    });

    canvas.addEventListener('mousemove', function(e) {
        if (isDrawing && (brushMode === 'select' || brushMode === 'delete')) {
            draw(e);
        }
    });

    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // 触摸事件
    canvas.addEventListener('touchstart', function(e) {
        if (brushMode === 'select' || brushMode === 'delete') {
            e.preventDefault();
            startDrawing(e);
        }
    });

    canvas.addEventListener('touchmove', function(e) {
        if (isDrawing && (brushMode === 'select' || brushMode === 'delete')) {
            e.preventDefault();
            draw(e);
        }
    });

    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);

    










    // 保存canvas上面的图像，转base64
    function saveCanvas() {
        // 创建一个新的 canvas 用于保存最终图像
        const saveCanvas = document.createElement('canvas');
        const saveCtx = saveCanvas.getContext('2d');
        saveCanvas.width = img.clientWidth;
        saveCanvas.height = img.clientHeight;
    
        // 计算图片在 editableImage 中的位置和缩放比例
        const imageContainer = document.getElementById('imageContainer');
        const containerWidth = imageContainer.clientWidth;
        const containerHeight = imageContainer.clientHeight;
        const imageWidth = img.clientWidth;
        const imageHeight = img.clientHeight;
    
        const scaleX = imageWidth / img.naturalWidth;
        const scaleY = imageHeight / img.naturalHeight;
        const scale = Math.min(scaleX, scaleY);
        const scaledWidth = img.naturalWidth * scale;
        const scaledHeight = img.naturalHeight * scale;
    
        const offsetX = (imageWidth - scaledWidth) / 2;
        const offsetY = (imageHeight - scaledHeight) / 2;
    
        // 绘制图片的原始内容
        saveCtx.drawImage(tempCanvas, 0, 0, img.naturalWidth, img.naturalHeight, offsetX, offsetY, scaledWidth, scaledHeight);
    
        // 设置 globalCompositeOperation 为 source-over
        saveCtx.globalCompositeOperation = "source-over";
    
        // 绘制 selectedRegions
        saveCtx.save();
        saveCtx.translate(offsetX, offsetY);
        saveCtx.scale(scale, scale);
        selectedRegions.forEach(region => {
            saveCtx.beginPath();
            saveCtx.moveTo(region[0].x, region[0].y);
            for (let i = 1; i < region.length; i++) {
                saveCtx.lineTo(region[i].x, region[i].y);
            }
            saveCtx.closePath();
            saveCtx.stroke();
        });
        saveCtx.restore();
    
        // 设置 globalCompositeOperation 为 destination-in
        saveCtx.globalCompositeOperation = "destination-in";
    
        // 绘制 canvas 上的内容
        saveCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, offsetX, offsetY, scaledWidth, scaledHeight);
    
        // 将最终图像转换为 Blob 格式
        saveCanvas.toBlob(function(blob) {
            console.log('Blob:', blob); // 调试信息
            if (!blob || blob.size === 0) {
                console.error('Blob is empty or invalid');
                alert("生成的图片数据无效");
                return;
            }

    
            // 下载图片
            savePicture(blob);
        }, "image/png");
    }
    
// 下载图片函数
function savePicture(blob) {
    var url = URL.createObjectURL(blob);
    // 将 URL 设置为预览图片的 src
    const previewImage = document.getElementById('previewImage');
    previewImage.src = url;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function(blob) {
            saveAs(blob, 'download.png'); // 使用FileSaver.js保存文件
        });
    };
    img.src = url;
}


   

    // 为保存按钮添加事件监听器
    document.getElementById('saveCanvasButton').addEventListener('click', saveCanvas);

    // 清空画板
    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // 清除整个画板区域的内容和所有绘制的线条和形状等图形元素，恢复到初始状态
    }

    // 为清空按钮添加事件监听器
    document.getElementById('clearCanvasButton').addEventListener('click', clearCanvas);
}