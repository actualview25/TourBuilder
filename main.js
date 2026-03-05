const THREE = window.THREE;
const OrbitControls = THREE.OrbitControls;

console.log('✅ THREE loaded:', !!THREE);
console.log('✅ OrbitControls loaded:', !!OrbitControls);

// بهذا (ألوان واضحة تماماً)
const pathColors = { 
    EL: 0xffaa00,  // أصفر غامق (ذهب) 🟡
    AC: 0x0033cc,  // 🔵 أزرق غامق (كحلي)
    WP: 0x0044aa,  // أزرق كحلي غامق
    WA: 0xff0000,  // 🔴 أحمر صريح
    GS: 0x006633   // 🟢 أخضر غامق
};
let currentPathType = 'EL';
// =======================================
// تغيير نوع المسار الحالي (✅ هذه الدالة ناقصة)
// =======================================
window.setCurrentPathType = function(type) {
    // تحديث المتغير العام
    currentPathType = type;
    
    // تحديث لون الكرة (markerPreview)
    if (markerPreview) {
        markerPreview.material.color.setHex(pathColors[currentPathType]);
        markerPreview.material.emissive.setHex(pathColors[currentPathType]);
        console.log('🎨 تم تحديث لون الكرة إلى:', currentPathType);
    }
    
    // تحديث شريط الحالة
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerHTML = `النوع الحالي: <span style="color:#${pathColors[currentPathType].toString(16)};">${currentPathType}</span>`;
    }
    
    console.log('✅ تم تغيير نوع المسار إلى:', type);
};
// =======================================
// ١. نظام Hotspots الموحد
// =======================================
const HotspotSystem = {
    markers: {},
    backgroundSpheres: {},
    
    create: function(position, type, data, id) {
        const bgSphere = this.createBackgroundSphere(position, type, id);
        const icon = this.createIcon(position, type, data, id);
        return { bgSphere, icon };
    },
    
    createBackgroundSphere: function(position, type, id) {
        const color = type === 'SCENE' ? 0x44aaff : 0xffaa44;
        const geometry = new THREE.SphereGeometry(12, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.15
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        sphere.userData = { type: 'hotspot-background', hotspotId: id, hotspotType: type };
        
        if (typeof scene !== 'undefined' && scene) {
            scene.add(sphere);
        }
        this.backgroundSpheres[id] = sphere;
        
        return sphere;
    },
    
    createIcon: function(position, type, data, id) {
        const div = document.createElement('div');
        div.className = 'hotspot-marker';
        div.setAttribute('data-id', id);
        div.setAttribute('data-type', type);
        
        const iconUrl = type === 'SCENE' ? 'icon/hotspot.png' : 'icon/info.png';
        const borderColor = type === 'SCENE' ? '#44aaff' : '#ffaa44';
        const displayText = type === 'SCENE' 
            ? (data.targetSceneName || 'انتقال') 
            : (data.title || 'معلومات');
        
        div.innerHTML = `
            <img src="${iconUrl}" alt="${type}" style="border: 2px solid ${borderColor}; border-radius: 50%; background: rgba(0,0,0,0.3); width: 40px; height: 40px; pointer-events: none;">
            <div class="hotspot-label" style="border-color: ${borderColor};">${displayText}</div>
            <div class="hotspot-controls" style="position: absolute; top: -20px; right: -20px; display: flex; gap: 5px;">
                <button class="edit-btn" onclick="window.editHotspotFromUI('${id}')" title="تعديل" style="background: #4a6c8f; border: none; color: white; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">✏️</button>
                <button class="delete-btn" onclick="window.deleteHotspotFromUI('${id}')" title="حذف" style="background: #882222; border: none; color: white; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">🗑️</button>
            </div>
        `;
        
        div._worldPosition = position.clone();
        
        if (type === 'INFO') {
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('edit-btn') && !e.target.classList.contains('delete-btn')) {
                    showCustomInfoWindow(data.title, data.content, 'info');
                }
            });
        } else {
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('edit-btn') && !e.target.classList.contains('delete-btn')) {
                    if (window.sceneManager && data.targetSceneId) {
                        window.sceneManager.switchToScene(data.targetSceneId);
                    }
                }
            });
        }

    document.body.appendChild(div);
        this.markers[id] = div;
        
        return div;
    },
    
    rebuild: function(hotspots) {
        this.clear();
        
        if (!hotspots || hotspots.length === 0) return;
        
        hotspots.forEach(h => {
            const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
            this.create(pos, h.type, h.data, h.id);
        });
        
        this.updatePositions();
        console.log(`✅ تم إنشاء ${hotspots.length} نقطة`);
    },
    
    updatePositions: function() {
        if (typeof camera === 'undefined' || !camera) return;
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        Object.values(this.markers).forEach(icon => {
            if (!icon._worldPosition) return;
            
            const pos = icon._worldPosition.clone().project(camera);
            
            if (pos.z > 1) {
                icon.style.display = 'none';
                return;
            }
            
            const x = (pos.x * 0.5 + 0.5) * width;
            const y = (-pos.y * 0.5 + 0.5) * height;
            
            icon.style.left = x + 'px';
            icon.style.top = y + 'px';
            
            icon.style.display = (x < -100 || x > width + 100 || y < -100 || y > height + 100) ? 'none' : 'block';
        });
    },
    
    clear: function() {
        Object.values(this.markers).forEach(icon => {
            if (icon && icon.parentNode) {
                icon.parentNode.removeChild(icon);
            }
        });
        this.markers = {};
        
        Object.values(this.backgroundSpheres).forEach(sphere => {
            if (sphere && typeof scene !== 'undefined' && scene) {
                scene.remove(sphere);
            }
        });
        this.backgroundSpheres = {};
    },
    
    remove: function(id) {
        if (this.markers[id] && this.markers[id].parentNode) {
            this.markers[id].parentNode.removeChild(this.markers[id]);
            delete this.markers[id];
        }
        if (this.backgroundSpheres[id] && typeof scene !== 'undefined' && scene) {
            scene.remove(this.backgroundSpheres[id]);
            delete this.backgroundSpheres[id];
        }
    }
};

// =======================================
// ٢. إدارة المشاريع
// =======================================
class ProjectManager {
    constructor() {
        this.projects = [];
        this.currentProject = null;
        this.loadProjects();
    }

    loadProjects() {
        const saved = localStorage.getItem('virtual-tour-projects');
        if (saved) this.projects = JSON.parse(saved);
    }

    saveProjects() {
        localStorage.setItem('virtual-tour-projects', JSON.stringify(this.projects));
    }

    newProject(name) {
        const project = {
            id: Date.now(),
            name: name || `مشروع-${new Date().toLocaleDateString()}`,
            created: new Date().toISOString(),
            paths: [],
            imageData: null
        };

    this.projects.push(project);
        this.currentProject = project;
        this.saveProjects();
        return project;
    }

    saveCurrentProject(paths, imageData) {
        if (this.currentProject) {
            this.currentProject.paths = paths.map(path => ({
                type: path.userData.type,
                color: '#' + pathColors[path.userData.type].toString(16).padStart(6, '0'),
                points: path.userData.points.map(p => ({ x: p.x, y: p.y, z: p.z }))
            }));
            this.currentProject.imageData = imageData;
            this.currentProject.lastModified = new Date().toISOString();
            this.saveProjects();
        }
    }
}

// =======================================
// ٣. إدارة المشاهد المتعددة (محسنة)
// =======================================
class SceneManager {
    constructor() {
        this.scenes = [];
        this.currentScene = null;
        this.currentSceneIndex = 0;
        this.db = null;
        this.measurements = {}; // تخزين القياسات لكل مشهد
        this.initDB();
    }

    initDB() {
        const request = indexedDB.open('VirtualTourDB', 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('scenes')) {
                db.createObjectStore('scenes', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            this.db = e.target.result;
            this.loadScenes();
            console.log('✅ IndexedDB initialized');
        };
    }

    loadScenes() {
        if (!this.db) return;
        const tx = this.db.transaction('scenes', 'readonly');
        const store = tx.objectStore('scenes');
        const request = store.getAll();

        request.onsuccess = () => {
            this.scenes = request.result || [];
            // تحميل القياسات المحفوظة
            this.scenes.forEach(scene => {
                if (scene.measurements) {
                    this.measurements[scene.id] = scene.measurements;
                }
            });
            console.log(`✅ تم تحميل ${this.scenes.length} مشهد`);
            if (typeof updateScenePanel === 'function') updateScenePanel();
        };
    }

    saveScenes() {
        if (!this.db) return;
        const tx = this.db.transaction('scenes', 'readwrite');
        const store = tx.objectStore('scenes');
        store.clear();
        
        // دمج القياسات مع المشاهد قبل الحفظ
        this.scenes = this.scenes.map(scene => ({
            ...scene,
            measurements: this.measurements[scene.id] || []
        }));
        
        this.scenes.forEach(scene => store.add(scene));
        console.log('✅ تم حفظ المشاهد');
        if (typeof updateScenePanel === 'function') updateScenePanel();
    }

   async addScene(name, imageFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scene = {
                    id: `scene-${Date.now()}-${Math.random()}`,
                    name: name,
                    originalImage: e.target.result,
                    paths: [],
                    hotspots: [],
                    measurements: [],
                    created: new Date().toISOString(),
                    order: this.scenes.length  // ✅ هذا يحل مشكلة الترتيب
                };
                this.scenes.push(scene);
                this.measurements[scene.id] = [];
                this.saveScenes();
                resolve(scene);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
    });
}

    addHotspot(sceneId, type, position, data) {
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) return null;

        const hotspot = {
            id: `hotspot-${Date.now()}-${Math.random()}`,
            type: type,
            position: { x: position.x, y: position.y, z: position.z },
            data: data,
            created: new Date().toISOString()
        };

        if (!scene.hotspots) scene.hotspots = [];
        scene.hotspots.push(hotspot);
        
        this.saveScenes();
        return hotspot;
    }

    // إضافة قياس جديد للمشهد الحالي
    addMeasurement(sceneId, measurement) {
        if (!this.measurements[sceneId]) {
            this.measurements[sceneId] = [];
        }
        this.measurements[sceneId].push({
            ...measurement,
            id: `measure-${Date.now()}-${Math.random()}`
        });
        this.saveScenes();
    }

    switchToScene(sceneId) {
    const sceneData = this.scenes.find(s => s.id === sceneId);
    if (!sceneData) return false;

    // ===== 🔴 الأهم: حفظ المسارات الحالية قبل التبديل =====
    if (this.currentScene && paths.length > 0) {
        console.log('💾 حفظ مسارات المشهد الحالي:', paths.length);
        this.currentScene.paths = paths.map(p => ({
            type: p.userData.type,
            color: '#' + pathColors[p.userData.type].toString(16).padStart(6, '0'),
            points: p.userData.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
        }));
        this.saveScenes(); // حفظ فوري
    }

    this.currentScene = sceneData;

    // تنظيف المشهد الحالي
    paths.forEach(p => scene.remove(p));
    paths = [];
    clearCurrentDrawing();

    // تحميل صورة المشهد الجديد
    if (sphereMesh && sphereMesh.material) {
        loadSceneImage(sceneData.originalImage);
    }

    // ===== 🔴 إعادة بناء المسارات المحفوظة =====
    if (sceneData.paths && sceneData.paths.length > 0) {
        console.log('🔄 استعادة مسارات:', sceneData.paths.length);
        sceneData.paths.forEach(pathData => {
            const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
            const oldType = currentPathType;
            currentPathType = pathData.type;
            createStraightPath(points);
            currentPathType = oldType;
        });
    }

    // إعادة بناء الهوتسبوتات
    if (sceneData.hotspots) {
        HotspotSystem.rebuild(sceneData.hotspots);
    } else {
        HotspotSystem.clear();
    }

    // إظهار القياسات المحفوظة
    if (sceneData.measurements) {
        showMeasurementsForScene(sceneId);
    }

    if (typeof updateScenePanel === 'function') updateScenePanel();
    this.saveScenes();
    return true;
}


        // تنظيف المشهد الحالي
        paths.forEach(p => scene.remove(p));
        paths = [];
        clearCurrentDrawing();

        // تحميل صورة المشهد الجديد
        if (sphereMesh && sphereMesh.material) {
            loadSceneImage(sceneData.originalImage);
        }

        // إعادة بناء المسارات
        if (sceneData.paths) {
            sceneData.paths.forEach(pathData => {
                const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                const oldType = currentPathType;
                currentPathType = pathData.type;
                createStraightPath(points);
                currentPathType = oldType;
            });
        }

        // إعادة بناء الهوتسبوتات
        if (sceneData.hotspots) {
            HotspotSystem.rebuild(sceneData.hotspots);
        } else {
            HotspotSystem.clear();
        }

        // إظهار القياسات المحفوظة
        if (sceneData.measurements) {
            showMeasurementsForScene(sceneId);
        }

        if (typeof updateScenePanel === 'function') updateScenePanel();
        this.saveScenes();
        return true;
    }

    deleteScene(sceneId) {
        const index = this.scenes.findIndex(s => s.id === sceneId);
        if (index !== -1) {
            this.scenes.splice(index, 1);
            delete this.measurements[sceneId];
            if (this.currentScene && this.currentScene.id === sceneId) {
                if (this.scenes.length > 0) {
                    this.switchToScene(this.scenes[0].id);
                } else {
                    this.currentScene = null;
                    if (typeof loadPanorama === 'function') loadPanorama();
                }
            }
            this.saveScenes();
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }
}


// =======================================
// ٤. تصدير الجولات
// =======================================
class TourExporter {
    constructor() {
        this.zip = new JSZip();
    }

   async exportTour(projectName, scenes) {
    const folder = this.zip.folder(projectName);
    
    // إضافة صور المشاهد مع الحماية
   // إضافة صور المشاهد مع الحماية القصوى
scenes.forEach((scene, index) => {
    try {
        const imageSrc = scene.originalImage || scene.image;
        
        // ✅ الحماية الذكية التي ذكرتها
        if (
            typeof imageSrc === 'string' && 
            imageSrc.includes(',') && 
            imageSrc.split(',').length > 1
        ) {
            const imageData = imageSrc.split(',')[1];
            if (imageData) {
                folder.file(`scene-${index}.jpg`, imageData, { base64: true });
            } else {
                console.warn('⚠️ المشهد', index, 'بيانات الصورة فارغة');
            }
        } else {
            console.warn('⚠️ المشهد', index, 'لا يحتوي على صورة base64 صالحة');
        }
    } catch (e) {
        console.warn('⚠️ خطأ في معالجة صورة المشهد', index, e.message);
    }
});
    
    // إضافة مجلد icon مع الصور
    const iconFolder = folder.folder('icon');
    
    try {
        const hotspotResponse = await fetch('icon/hotspot.png');
        const hotspotBlob = await hotspotResponse.blob();
        iconFolder.file('hotspot.png', hotspotBlob);
        
        const infoResponse = await fetch('icon/info.png');
        const infoBlob = await infoResponse.blob();
        iconFolder.file('info.png', infoBlob);
    } catch (error) {
        console.warn('⚠️ لم يتم العثور على الأيقونات، استخدام base64');
        
        const hotspotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAIzSURBVFiF7ZbNaxNBGMZ/djdpk0hS9KIoigp68RRyUw8iKHgRLyIoePCi4F8g3nrwU0Tx4lEQvSh4EcF78NqLIAp68SNoFZE2TdMk3R2f2SSbdNPd2Z0NIvpAXjLMvM/8ZucjMwsHqIEa+J+hlJpOkrS0Z0mS1NM0nSu7l+M4h5VSy1rrn1rrb6W4LmBZ1hWl1LKUsl3L+t+01rdLcUMApdRVpdTC3r6iKOqMx+O+UsoPw/CFlHK1lFoJMAzjiVJqRQgR+b5/37Ks4+Fw+DaKovvtdvux4ziLUkq/LEcIYVvW3SRJ+lLKL5qmZ9I0HUopDc/zTmZZtpZlWZJl2YYoG4MQYgSAYRgIIW5IKZ1iPGmaXgPA8zySJOlKKdM0TdM0rZfRB8iyrC2lTNI0nSmKIl3X69M0PTRN0+WyHMa11pckSRohhC2l/JYkyXBRPrdt25RSr5Zl3zFN88F4PP4mpdwJguBpFEX3m83mGRhzLwjDMHzJmP0wDMMXWZZ93G63H5fN78sopdA5N0opP0mSl/P5vN5sNh/zAymE+LqcT2uN1jqRUn6Joqg9nU4fFNM2DMMo2l95GGP/SylvR1H0oEifMzsIgoNSyjaMpZRfl8vlvTAMP0dRdG/btvu+7z9jzG4X6Wc3j8OYe7Lf75+M47hXdXyUUh8BgDF7yhj7yZhbzOfz22maHjPGTjPGxJ+WnzE2Wq/Xh5RSl1ar1Yk8zzvL5fJ4GIa9JEk6URT1lFL9NE17cRwfybLsp9Z6tVqtDsI4fAtjX6rGgRrY4/wCJ8zvggPQ/IEAAAAASUVORK5CYII=';
        const infoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAI5SURBVFiF7ZbPaxNBFMfnt5vdJBIp1l6kFQU9eCk9tQcVBC+iIAgK4kXw7l/w4EEQ70178aAHQfBPRBCvXrwIgqBQ6FURtPUDLVIrSdP9MW+TTbrZzWazWwX7hQWZZeZ95v2Y994bGAVK0P8ZY2yP1rohpXzDOS9JKfcaY56Ypvk4DMMyY+xrFEWJ53nblFKPm812qVR6qJRa55w/aF3GGJ9zHiqlZqIoOgIAtm2f6nQ6FxhjZZZlH6IoOtsfhzF2l2VZXSlV55y/CYLgJgCkaToex/G0lHIGAAqFgimESBhjUwCglNqqlPoqhIgBQEq5GEXRac55RUr5xXGcQQBQSq2GYfgGAJRS61LKz4yxm2EYjhbzL5VKawBgrgM3DONBEARHlFKbAIBS6nOl1B6l1DwA6Hq9frRQKNSiKNohl6vVal+hUNjfbDaPAkCxWHzKGNtXKBSqk8nksWEYZ5Ikqbquu1Yul2d938+63e5UoVA4I6W8CgC2bT9JkuQeAGRZ5gOAaZqjUkpTSrmZZdl9pVQtSZJ7xWKxBAA6jmOO42wIIa4BQLlcDjjn3w3DqAkhVgGAc34tjuM5pdS8EOJXmUwmE0KIvQDAOT8KACzLspc8z3vLGJuJomg6TVPP87zJLMu8TqfzI89zLwiCvZxzkWVZP5/P5wFgLMs2pJTVKIp6nPOs2Wx+Y4z9FkKcBICRUmkpy7K6lPJGHMfHS6XSEs65ZVnWbD6f38rzfMxxnM+B759I0/Qp5/w4Y6wQJMl2IcRcGIaHhRDbgyB4JKU8yRirCiE+D7z/H6AE9Y1+As0ZxH2vO/WTAAAAAElFTkSuQmCC';
        
        iconFolder.file('hotspot.png', hotspotBase64, { base64: true });
        iconFolder.file('info.png', infoBase64, { base64: true });
    }
    
    // تجهيز بيانات المشاهد مع الحماية الكاملة
    const scenesData = scenes.map((scene, index) => {
        // حماية المسارات
        const paths = (scene.paths || []).map(p => {
            if (!p || typeof p !== 'object') return null;
            return {
                type: p.type || 'unknown',
                color: p.color || '#ffaa44',
                points: (p.points || []).map(pt => ({
                    x: pt?.x || 0,
                    y: pt?.y || 0,
                    z: pt?.z || 0
                }))
            };
        }).filter(p => p !== null);
        
        // حماية الهوتسبوتات
        const hotspots = (scene.hotspots || []).map(h => {
            if (!h || typeof h !== 'object') return null;
            return {
                id: h.id || `hotspot-${Date.now()}`,
                type: h.type || 'INFO',
                position: {
                    x: h.position?.x || 0,
                    y: h.position?.y || 0,
                    z: h.position?.z || 0
                },
                data: h.data || {}
            };
        }).filter(h => h !== null);
        
        // حماية القياسات (الجديدة)
        const measurements = (scene.measurements || []).map(m => {
            if (!m || typeof m !== 'object') return null;
            return {
                id: m.id || `measure-${Date.now()}`,
                length: m.length || 0,
                height: m.height || 0,
                start: {
                    x: m.start?.x || 0,
                    y: m.start?.y || 0,
                    z: m.start?.z || 0
                },
                end: {
                    x: m.end?.x || 0,
                    y: m.end?.y || 0,
                    z: m.end?.z || 0
                }
            };
        }).filter(m => m !== null);
        
        return {
            id: scene.id || `scene-${index}`,
            name: scene.name || `مشهد ${index + 1}`,
            image: `scene-${index}.jpg`,
            paths: paths,
            hotspots: hotspots,
            measurements: measurements // الآن آمنة 100%
        };
    });
    
    folder.file('tour-data.json', JSON.stringify(scenesData, null, 2));
    folder.file('index.html', this.generatePlayerHTML(projectName));
    folder.file('style.css', this.generatePlayerCSS());
    folder.file('README.md', this.generateReadme(projectName));
    
    const content = await this.zip.generateAsync({ type: 'blob' });
    saveAs(content, `${projectName}.zip`);
}

generatePlayerHTML(projectName) {
return `

<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${projectName} - جولة افتراضية</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; overflow: hidden; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; }
        #container { width: 100vw; height: 100vh; background: #000; }
        
        /* ===== شريط الأدوات العلوي - مثل الأداة تماماً ===== */
        .toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            background: rgba(20, 30, 40, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(74, 108, 143, 0.3);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            z-index: 1000;
            color: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }

        .logo {
            font-size: 20px;
            font-weight: bold;
            color: #fff;
            text-shadow: 0 0 20px rgba(136, 170, 255, 0.5);
        }

        .tour-name {
            font-size: 14px;
            color: rgba(255,255,255,0.9);
            background: rgba(255,255,255,0.1);
            padding: 6px 16px;
            border-radius: 30px;
            border: 1px solid rgba(74,108,143,0.4);
            backdrop-filter: blur(5px);
        }
        
        /* ===== إزالة الـ info القديم ===== */
        .info {
            display: none;
        }
        
        /* ===== أزرار التحكم ===== */
        #autoRotateBtn {
            position: fixed; 
            bottom: 20px; 
            left: 50%; 
            transform: translateX(-50%);
            padding: 12px 24px; 
            background: rgba(20, 30, 40, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: white;
            border: 1px solid rgba(74, 108, 143, 0.3);
            border-radius: 30px; 
            cursor: pointer;
            z-index: 900; 
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        }
        #autoRotateBtn:hover { 
            background: rgba(74, 108, 143, 0.6); 
            transform: translateX(-50%) scale(1.05); 
        }
        
        /* ===== زر القياسات ===== */
        #toggleMeasurements {
            position: fixed; 
            bottom: 80px; 
            right: 20px; 
            padding: 10px 20px;
            background: rgba(20, 30, 40, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: white; 
            border: 1px solid rgba(74, 108, 143, 0.3);
            border-radius: 30px; 
            cursor: pointer; 
            z-index: 900; 
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        }
        #toggleMeasurements:hover { 
            background: rgba(74, 108, 143, 0.6); 
            transform: scale(1.05); 
        }
        #toggleMeasurements.active { 
            background: rgba(136, 68, 136, 0.6);
            border-color: #ffaa44;
        }
        
        /* ===== زر المسارات للهاتف ===== */
        .paths-toggle-btn {
            display: none;
        }
        
        /* ===== لوحة المسارات ===== */
        .paths-control-panel {
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(20, 30, 40, 0.25);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(74, 108, 143, 0.3);
            border-radius: 12px;
            color: white;
            z-index: 900;
            padding: 15px;
            min-width: 200px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            direction: rtl;
        }
        .paths-control-panel h3 { 
            margin: 0 0 10px 0; 
            color: white; 
            font-size: 14px; 
            text-align: center; 
            border-bottom: 1px solid rgba(74, 108, 143, 0.2); 
            padding-bottom: 8px; 
            font-weight: 500;
        }
        .path-toggle-item { 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            padding: 6px 0; 
            border-bottom: 1px solid rgba(255,255,255,0.05); 
        }
        .path-toggle-item:last-child { border-bottom: none; }
        .path-toggle-item input[type="checkbox"] { 
            width: 16px; 
            height: 16px; 
            cursor: pointer; 
            accent-color: #4a6c8f; 
            background: transparent;
        }
        .path-toggle-item label { 
            flex: 1; 
            cursor: pointer; 
            font-size: 13px; 
            display: flex; 
            align-items: center; 
            gap: 8px; 
            color: rgba(255,255,255,0.9);
        }
        .path-color-dot { 
            width: 14px; 
            height: 14px; 
            border-radius: 4px; 
            display: inline-block; 
        }
        
/* ===== لوحة المشاهد - نفس الحجم السابق مع سكرول ===== */
.scene-list-panel {
    position: fixed; 
    top: 50%; 
    left: 20px; 
    transform: translateY(-50%);
    width: 260px; 
    max-height: 70vh; /* نفس الحجم السابق */
    background: rgba(20, 30, 40, 0.25);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(74, 108, 143, 0.3);
    border-radius: 12px;
    color: white;
    z-index: 900;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.3s ease; /* مهم لزر الإخفاء */
}

/* حالة الإخفاء - نفس الحجم السابق */
.scene-list-panel.collapsed {
    width: 50px;
    overflow: hidden;
}

.scene-list-panel.collapsed .panel-header h3 span:last-child,
.scene-list-panel.collapsed .scene-list-container {
    display: none;
}

.panel-header {
    padding: 12px;
    border-bottom: 1px solid rgba(74, 108, 143, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0,0,0,0.2);
    flex-shrink: 0;
    cursor: pointer; /* مؤشر يد للزر */
}

.panel-header h3 { 
    margin: 0; 
    color: white; 
    font-size: 14px; 
    font-weight: 500; 
    display: flex; 
    align-items: center; 
    gap: 8px; 
}

.panel-toggle {
    background: none; 
    border: none; 
    color: rgba(255,255,255,0.7); 
    font-size: 16px; 
    cursor: pointer;
    width: 28px; 
    height: 28px; 
    border-radius: 50%; 
    display: flex;
    align-items: center; 
    justify-content: center; 
    transition: all 0.2s;
    flex-shrink: 0;
}

.panel-toggle:hover { 
    background: rgba(255,255,255,0.1); 
    color: white; 
}

/* قائمة المشاهد - مع سكرول */
.scene-list-container {
    max-height: calc(70vh - 60px); /* نفس الحساب السابق */
    overflow-y: auto !important;
    overflow-x: hidden;
    padding: 8px;
    scrollbar-width: thin;
    scrollbar-color: rgba(74, 108, 143, 0.4) rgba(0,0,0,0.2);
}

/* تحسين شريط التمرير - نحيف جداً */
.scene-list-container::-webkit-scrollbar {
    width: 4px;
}

.scene-list-container::-webkit-scrollbar-track {
    background: transparent;
}

.scene-list-container::-webkit-scrollbar-thumb {
    background: rgba(74, 108, 143, 0.3);
    border-radius: 4px;
}

.scene-list-container::-webkit-scrollbar-thumb:hover {
    background: rgba(74, 108, 143, 0.6);
}

/* عناصر المشاهد - نفس الحجم */
.scene-item {
    padding: 10px 12px;
    margin: 4px 0;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    font-size: 13px;
}
        
        /* ===== أنماط Hotspots ===== */
        .hotspot-marker {
            position: absolute;
            transform: translate(-50%, -50%);
            cursor: pointer;
            z-index: 1000;
            pointer-events: auto;
            transition: none;
        }
        .hotspot-marker img {
            width: 40px;
            height: 40px;
            filter: drop-shadow(0 0 10px currentColor);
            pointer-events: none;
            transition: transform 0.2s ease;
            border-radius: 50%;
            background: rgba(0,0,0,0.3);
            border: 2px solid;
        }
        .hotspot-marker:hover img {
            transform: scale(1.15);
            filter: drop-shadow(0 0 15px gold);
        }
        .hotspot-label {
            position: absolute; 
            top: -40px; 
            left: 50%; 
            transform: translateX(-50%);
            background: rgba(20, 30, 40, 0.95); 
            backdrop-filter: blur(5px);
            color: white; 
            padding: 6px 12px; 
            border-radius: 20px;
            font-size: 12px; 
            white-space: nowrap; 
            border: 2px solid;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); 
            opacity: 0;
            transition: opacity 0.2s ease; 
            pointer-events: none; 
            z-index: 1001;
            font-weight: 500;
        }
        .hotspot-marker:hover .hotspot-label { opacity: 1; }
        
        /* ===== أنماط القياسات ===== */
        .measurement-line {
            position: absolute; 
            pointer-events: none; 
            z-index: 500;
            border-top: 4px solid #ffaa44; 
            box-shadow: 0 0 20px #ffaa44;
            border-radius: 4px; 
            transform-origin: 0 0; 
            height: 4px;
        }
        .measurement-point {
            position: absolute; 
            width: 12px; 
            height: 12px;
            background: #ffaa44; 
            border-radius: 50%;
            box-shadow: 0 0 20px #ffaa44; 
            transform: translate(-50%, -50%); 
            z-index: 501;
        }
        .measurement-label {
            position: absolute; 
            background: rgba(0, 0, 0, 0.8);
            color: white; 
            padding: 8px 16px; 
            border-radius: 30px; 
            font-size: 20px;
            font-weight: bold; 
            border: 2px solid #ffaa44; 
            box-shadow: 0 0 30px #ffaa44;
            transform: translate(-50%, -50%); 
            white-space: nowrap; 
            z-index: 503;
            backdrop-filter: blur(5px); 
            text-shadow: 2px 2px 4px black;
        }
        
        /* ===== نافذة المعلومات ===== */
        .custom-info-window {
            position: fixed; 
            bottom: 30px; 
            left: 50%; 
            transform: translateX(-50%);
            background: rgba(20, 30, 40, 0.95); 
            backdrop-filter: blur(10px);
            border: 2px solid #ffaa44; 
            border-radius: 16px; 
            padding: 20px 30px;
            color: white; 
            z-index: 2000; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            max-width: 400px; 
            width: 90%; 
            animation: slideUp 0.3s ease; 
            direction: rtl;
        }
        
        @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
        
        /* ===== تحسينات الهاتف ===== */
        @media (max-width: 768px) {
            .toolbar {
                height: 50px;
                padding: 0 15px;
            }
            .logo { font-size: 16px; }
            .tour-name { font-size: 12px; padding: 4px 12px; }
            
            .paths-control-panel {
                position: fixed;
                top: auto;
                bottom: 140px;
                right: 10px;
                left: 10px;
                width: auto;
                max-width: none;
                display: none;
                z-index: 950;
            }
            .paths-control-panel.show {
                display: block;
            }
            
            .paths-toggle-btn {
                display: flex;
                position: fixed;
                bottom: 140px;
                right: 10px;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: rgba(74, 108, 143, 0.8);
                border: 2px solid #88aaff;
                color: white;
                font-size: 20px;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 900;
                backdrop-filter: blur(5px);
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            
            .scene-list-panel { 
                width: 200px; 
                left: 10px; 
            }
            .scene-list-panel.collapsed { 
                width: 40px; 
                left: 0; 
            }
            
            #autoRotateBtn { 
                font-size: 13px; 
                padding: 10px 18px; 
            }
            #toggleMeasurements { 
                bottom: 70px; 
                right: 10px; 
                padding: 8px 14px; 
                font-size: 12px; 
            }
        }
    </style>
</head>
<body>
    <!-- شريط الأدوات العلوي -->
    <div class="toolbar">
        <div class="logo">🏗️ Actual view Studio</div>
        <div class="tour-name">${projectName}</div>
    </div>
    
    <div id="container"></div>
    
    <!-- أزرار التحكم -->
    <button id="autoRotateBtn">⏸️ إيقاف الدوران</button>
    <button id="toggleMeasurements" class="active">📏 إخفاء القياسات</button>
    
    <!-- زر المسارات للهاتف -->
    <button class="paths-toggle-btn" id="pathsToggleBtn">🔘</button>
    
    <!-- لوحة التحكم بالمسارات -->
    <div class="paths-control-panel">
        <h3>🔘 التحكم بالمسارات</h3>
        <div id="paths-toggle-list"></div>
    </div>
    
    <!-- لوحة المشاهد -->
    <div class="scene-list-panel" id="sceneListPanel">
        <div class="panel-header" id="panelHeader">
            <h3><span>📋</span><span>قائمة المشاهد</span></h3>
            <button class="panel-toggle" id="togglePanelBtn">◀</button>
        </div>
        <div class="scene-list-container" id="sceneListContainer"></div>
    </div>

    <script>
        // ===== المتغيرات العامة =====
        const ICONS = {
            hotspot: 'icon/hotspot.png',
            info: 'icon/info.png'
        };

        let autoRotate = true;
        let currentSceneIndex = 0;
        let scenes = [];
        let scene3D, camera, renderer, controls, sphereMesh;
        let allPaths = [];
        let hotspotMarkers = {};
        let measurementElements = [];
        let showMeasurements = true;
        
        const pathColors = { EL: '#ffcc00', AC: '#00ccff', WP: '#0066cc', WA: '#ff3300', GS: '#33cc33' };
        
        // ===== دوال القياس =====
        function createMeasurementElement(measurement) {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'measurement-line';
            
            const startPoint = document.createElement('div');
            startPoint.className = 'measurement-point';
            
            const endPoint = document.createElement('div');
            endPoint.className = 'measurement-point';
            
            const label = document.createElement('div');
            label.className = 'measurement-label';
            label.textContent = measurement.length + ' m';
            
            lineDiv._start = new THREE.Vector3(measurement.start.x, measurement.start.y, measurement.start.z);
            lineDiv._end = new THREE.Vector3(measurement.end.x, measurement.end.y, measurement.end.z);
            startPoint._worldPos = new THREE.Vector3(measurement.start.x, measurement.start.y, measurement.start.z);
            endPoint._worldPos = new THREE.Vector3(measurement.end.x, measurement.end.y, measurement.end.z);
            label._worldPos = new THREE.Vector3().addVectors(startPoint._worldPos, endPoint._worldPos).multiplyScalar(0.5);
            
            document.body.appendChild(lineDiv);
            document.body.appendChild(startPoint);
            document.body.appendChild(endPoint);
            document.body.appendChild(label);
            
            return { line: lineDiv, start: startPoint, end: endPoint, label };
        }

        function updateMeasurementPositions() {
            if (!camera) return;
            
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            measurementElements.forEach(elem => {
                if (!elem.line || !elem.line._start || !elem.line._end) return;
                
                const start = elem.line._start.clone().project(camera);
                const end = elem.line._end.clone().project(camera);
                
                if (start.z > 1 || end.z > 1) {
                    elem.line.style.display = 'none';
                    elem.start.style.display = 'none';
                    elem.end.style.display = 'none';
                    elem.label.style.display = 'none';
                    return;
                }

                const x1 = (start.x * 0.5 + 0.5) * width;
                const y1 = (-start.y * 0.5 + 0.5) * height;
                const x2 = (end.x * 0.5 + 0.5) * width;
                const y2 = (-end.y * 0.5 + 0.5) * height;
                
                if (x1 < -100 || x1 > width + 100 || y1 < -100 || y1 > height + 100 ||
                    x2 < -100 || x2 > width + 100 || y2 < -100 || y2 > height + 100) {
                    elem.line.style.display = 'none';
                    elem.start.style.display = 'none';
                    elem.end.style.display = 'none';
                    elem.label.style.display = 'none';
                    return;
                }
                
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                
                elem.line.style.display = showMeasurements ? 'block' : 'none';
                elem.line.style.left = x1 + 'px';
                elem.line.style.top = y1 + 'px';
                elem.line.style.width = length + 'px';
                elem.line.style.transform = 'rotate(' + angle + 'deg)';
                
                elem.start.style.display = showMeasurements ? 'block' : 'none';
                elem.start.style.left = x1 + 'px';
                elem.start.style.top = y1 + 'px';
                
                elem.end.style.display = showMeasurements ? 'block' : 'none';
                elem.end.style.left = x2 + 'px';
                elem.end.style.top = y2 + 'px';
                
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                elem.label.style.display = showMeasurements ? 'block' : 'none';
                elem.label.style.left = midX + 'px';
                elem.label.style.top = (midY - 30) + 'px';
            });
        }

        function clearMeasurements() {
            measurementElements.forEach(elem => {
                if (elem.line) elem.line.remove();
                if (elem.start) elem.start.remove();
                if (elem.end) elem.end.remove();
                if (elem.label) elem.label.remove();
            });
            measurementElements = [];
        }

        function loadMeasurements(sceneData) {
            clearMeasurements();
            if (sceneData.measurements && sceneData.measurements.length > 0) {
                sceneData.measurements.forEach(m => {
                    const elem = createMeasurementElement(m);
                    measurementElements.push(elem);
                });
            }
        }
        
        // ===== دوال المشاهد =====
        function initScenePanel() {
            const panel = document.getElementById('sceneListPanel');
            const toggleBtn = document.getElementById('togglePanelBtn');
            
            if (!panel || !toggleBtn) return;
            
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                panel.classList.toggle('collapsed');
                toggleBtn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
            });
            
            // استعادة الحالة المخزنة
            const savedState = localStorage.getItem('scenePanelCollapsed');
            if (savedState === 'true') {
                panel.classList.add('collapsed');
                toggleBtn.textContent = '▶';
            }
        }
        
        function updateSceneList() {
            const container = document.getElementById('sceneListContainer');
            if (!container) return;
            container.innerHTML = '';
            scenes.forEach((scene, index) => {
                const item = document.createElement('div');
                item.className = 'scene-item' + (index === currentSceneIndex ? ' active' : '');
                const hotspotCount = scene.hotspots ? scene.hotspots.length : 0;
                const measureCount = scene.measurements ? scene.measurements.length : 0;
                item.innerHTML = '<span class="scene-icon">' + (index === 0 ? '🏠' : '🏢') + '</span>' +
                    '<span class="scene-name">' + scene.name + '</span>' +
                    '<span class="scene-hotspot-count">' + hotspotCount + ' | 📏' + measureCount + '</span>';
                item.addEventListener('click', () => loadScene(index));
                container.appendChild(item);
            });
        }
        
        // ===== دوال Hotspots =====
        function createHotspotElement(x, y, type, data) {
            const div = document.createElement('div');
            div.className = 'hotspot-marker';
            div.style.left = x + 'px';
            div.style.top = y + 'px';
            div.style.cursor = 'pointer';
            div.style.zIndex = '1000';
            div.style.pointerEvents = 'auto';
            
            const iconUrl = type === 'SCENE' ? ICONS.hotspot : ICONS.info;
            const borderColor = type === 'SCENE' ? '#44aaff' : '#ffaa44';
            const displayText = type === 'SCENE' 
                ? (data.targetSceneName || 'انتقال') 
                : (data.title || 'معلومات');
            
            div.innerHTML = '<img src="' + iconUrl + '" alt="' + type + '" ' +
                'style="border: 2px solid ' + borderColor + '; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,0.3); pointer-events: none;">' +
                '<div class="hotspot-label" style="border-color: ' + borderColor + '; pointer-events: none;">' + 
                displayText + 
                '</div>';
            
            div.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                if (type === 'INFO') {
                    showInfoWindow(data.title, data.content);
                } else {
                    const targetIndex = scenes.findIndex(s => s.id === data.targetSceneId);
                    if (targetIndex !== -1) {
                        setTimeout(() => loadScene(targetIndex), 300);
                    }
                }
            });
            
            return div;
        }
        
        function showInfoWindow(title, content) {
            document.querySelectorAll('.custom-info-window').forEach(el => el.remove());
            
            const win = document.createElement('div');
            win.className = 'custom-info-window';
            win.innerHTML = '<div class="window-header">' +
                '<img src="' + ICONS.info + '">' +
                '<h3>' + (title || 'معلومات') + '</h3>' +
                '</div>' +
                '<div class="window-content">' + (content || '') + '</div>' +
                '<button class="window-close">حسناً</button>';
            
            win.querySelector('.window-close').onclick = () => win.remove();
            document.body.appendChild(win);
            
            setTimeout(() => win.remove(), 5000);
        }

        function rebuildHotspots() {
            document.querySelectorAll('.hotspot-marker').forEach(el => el.remove());
            hotspotMarkers = {};
            
            const currentScene = scenes[currentSceneIndex];
            if (!currentScene || !currentScene.hotspots || !currentScene.hotspots.length) return;
            
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            currentScene.hotspots.forEach(h => {
                let type = (typeof h.type === 'string') ? h.type.toUpperCase() : 'INFO';
                
                const pos = new THREE.Vector3(h.position.x, h.position.y, h.position.z);
                const projected = pos.clone().project(camera);
                
                if (projected.z > 1) return;
                
                const x = (projected.x * 0.5 + 0.5) * width;
                const y = (-projected.y * 0.5 + 0.5) * height;
                
                if (x < -100 || x > width + 100 || y < -100 || y > height + 100) return;
                
                const iconElement = createHotspotElement(x, y, type, h.data || {});
                iconElement._worldPosition = pos.clone();
                iconElement.dataset.id = h.id;
                
                document.body.appendChild(iconElement);
                hotspotMarkers[h.id] = iconElement;
            });
        }

        function updateHotspotsPosition() {
            const width = window.innerWidth;
            const height = window.innerHeight;

            Object.values(hotspotMarkers).forEach(el => {
                if (!el._worldPosition) return;

                const projected = el._worldPosition.clone().project(camera);

                if (projected.z > 1) {
                    el.style.display = 'none';
                    return;
                }

                const x = (projected.x * 0.5 + 0.5) * width;
                const y = (-projected.y * 0.5 + 0.5) * height;

                if (x < -100 || x > width + 100 || y < -100 || y > height + 100) {
                    el.style.display = 'none';
                    return;
                }

                el.style.display = 'block';
                el.style.left = x + 'px';
                el.style.top = y + 'px';
            });
        }
        
        // ===== دوال المسارات =====
        function togglePathsByType(type, visible) {
            allPaths.forEach(p => { 
                if (p.userData && p.userData.type === type) p.visible = visible; 
            });
        }
        
        function createPathsTogglePanel() {
            const toggleList = document.getElementById('paths-toggle-list');
            if (!toggleList) return;
            toggleList.innerHTML = '';
            ['EL', 'AC', 'WP', 'WA', 'GS'].forEach(type => {
                const div = document.createElement('div');
                div.className = 'path-toggle-item';
                div.innerHTML = '<input type="checkbox" id="toggle-' + type + '" checked data-type="' + type + '">' +
                    '<label for="toggle-' + type + '"><span class="path-color-dot" style="background:' + pathColors[type] + '"></span> ' + type + '</label>';
                div.querySelector('input').addEventListener('change', e => togglePathsByType(type, e.target.checked));
                toggleList.appendChild(div);
            });
        }
        
        function loadScene(index) {
            const sceneData = scenes[index];
            if (!sceneData) return;
            
            currentSceneIndex = index;
            
            if (sphereMesh) scene3D.remove(sphereMesh);
            document.querySelectorAll('.hotspot-marker').forEach(el => el.remove());
            allPaths.forEach(p => scene3D.remove(p));
            allPaths = [];
            
            new THREE.TextureLoader().load(sceneData.image, function(texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.x = -1;
                
                sphereMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(500, 128, 128),
                    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
                );
                scene3D.add(sphereMesh);
                
                if (sceneData.paths) {
                    sceneData.paths.forEach(pathData => {
                        const points = pathData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                        for (let i = 0; i < points.length - 1; i++) {
                            const start = points[i];
                            const end = points[i + 1];
                            const direction = new THREE.Vector3().subVectors(end, start);
                            const distance = direction.length();
                            if (distance < 5) continue;
                            
                            const cylinder = new THREE.Mesh(
                                new THREE.CylinderGeometry(3.5, 3.5, distance, 12),
                                new THREE.MeshStandardMaterial({ 
                                    color: pathData.color, 
                                    emissive: pathData.color, 
                                    emissiveIntensity: 0.3 
                                })
                            );
                            
                            const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                            cylinder.position.copy(midpoint);
                            cylinder.lookAt(end);
                            cylinder.rotateX(Math.PI / 2);
                            cylinder.userData = { type: pathData.type };
                            
                            scene3D.add(cylinder);
                            allPaths.push(cylinder);
                        }
                    });
                }
                
                setTimeout(rebuildHotspots, 200);
                loadMeasurements(sceneData);
                updateSceneList();
            });
        }
        // التأكد من ظهور السكرول
function ensureScrollbar() {
    const container = document.getElementById('sceneListContainer');
    if (!container) return;
    
    // حساب ارتفاع الرأس
    const header = document.querySelector('.panel-header');
    const headerHeight = header ? header.offsetHeight : 50;
    
    // ضبط ارتفاع القائمة
    container.style.maxHeight = (400 - headerHeight - 2) + 'px';
    container.style.overflowY = 'auto';
    
    console.log('📏 ارتفاع القائمة:', container.style.maxHeight);
}

// استدعاء بعد تحميل المشاهد
setTimeout(ensureScrollbar, 500);
window.addEventListener('resize', ensureScrollbar);
        // ===== التهيئة =====
        fetch('tour-data.json')
            .then(res => res.json())
            .then(data => {
                scenes = data;
                
                scene3D = new THREE.Scene();
                scene3D.background = new THREE.Color(0x000000);
                
                camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
                camera.position.set(0, 0, 0.1);
                
                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(window.innerWidth, window.innerHeight);
                document.getElementById('container').appendChild(renderer.domElement);
                
                scene3D.add(new THREE.AmbientLight(0xffffff, 1.5));
                
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableZoom = true;
                controls.enablePan = false;
                controls.enableDamping = true;
                controls.autoRotate = autoRotate;
                controls.autoRotateSpeed = 0.5;
                
                document.getElementById('autoRotateBtn').onclick = function() {
                    autoRotate = !autoRotate;
                    controls.autoRotate = autoRotate;
                    document.getElementById('autoRotateBtn').textContent = 
                        autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
                };
                
                document.getElementById('toggleMeasurements').addEventListener('click', function() {
                    showMeasurements = !showMeasurements;
                    this.textContent = showMeasurements ? '📏 إخفاء القياسات' : '📏 إظهار القياسات';
                    this.classList.toggle('active');
                    
                    measurementElements.forEach(elem => {
                        if (elem.line) elem.line.style.display = showMeasurements ? 'block' : 'none';
                        if (elem.start) elem.start.style.display = showMeasurements ? 'block' : 'none';
                        if (elem.end) elem.end.style.display = showMeasurements ? 'block' : 'none';
                        if (elem.label) elem.label.style.display = showMeasurements ? 'block' : 'none';
                    });
                });
                
                createPathsTogglePanel();
                initScenePanel();
                loadScene(0);
                
                window.addEventListener('resize', function() {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                    rebuildHotspots();
                });
                
                function animate() {
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene3D, camera);
                    
                    if (typeof updateMeasurementPositions === 'function') {
                        updateMeasurementPositions();
                    }
                }
                animate();

                controls.addEventListener('change', function() {
                    if (typeof updateHotspotsPosition === 'function') {
                        updateHotspotsPosition();
                    }
                });
            })
            .catch(err => console.error('خطأ في تحميل البيانات:', err));

        // ===== التحكم بإظهار/إخفاء المسارات في الهاتف =====
        const pathsToggleBtn = document.getElementById('pathsToggleBtn');
        const pathsPanel = document.querySelector('.paths-control-panel');

        if (pathsToggleBtn && pathsPanel) {
            pathsToggleBtn.addEventListener('click', function() {
                pathsPanel.classList.toggle('show');
                this.textContent = pathsPanel.classList.contains('show') ? '✕' : '🔘';
            });
            
            document.addEventListener('click', function(e) {
                if (window.innerWidth <= 768) {
                    if (!pathsPanel.contains(e.target) && e.target !== pathsToggleBtn) {
                        pathsPanel.classList.remove('show');
                        pathsToggleBtn.textContent = '🔘';
                    }
                }
            });
        }
    </script>
</body>
</html>`;
} 
generatePlayerCSS() {
        return `body { margin: 0; overflow: hidden; font-family: Arial, sans-serif; }
#container { width: 100vw; height: 100vh; background: #000; }
.info {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 10px 20px;
    border-radius: 30px;
    border: 2px solid #4a6c8f;
    z-index: 100;
    font-weight: bold;
    backdrop-filter: blur(5px);
}`;
    }
    generateReadme(projectName) {
        return `# ${projectName}

## جولة افتراضية ثلاثية الأبعاد

### كيفية الاستخدام:
1. افتح ملف \`index.html\` في المتصفح
2. استخدم الفأرة للتحرك داخل الجولة
3. اضغط على hotspots للتنقل

### الأنظمة:
- 🟡 EL: كهرباء
- 🔵 AC: تكييف
- 🔵 WP: مياه
- 🔴 WA: صرف صحي
- 🟢 GS: غاز

### القياسات:
تحتوي الجولة على قياسات معتمدة تم إدخالها يدوياً

---
تم إنشاؤها باستخدام Virtual Tour Studio © 2026`;
    }
}

// =======================================
// ٥. المتغيرات الأساسية
// =======================================
let scene, camera, renderer, controls;
let autorotate = true;
let drawMode = false;
let sphereMesh = null;
let selectedPoints = [];
let paths = [];
let tempLine = null;
let pointMarkers = [];
let markerPreview = null;
let exportCanvas, exportContext;
let sceneManager;
let hotspotMode = null;

// متغيرات القياس
let measureMode = false;
let measureStartPoint = null;
let measureTempLine = null;
let measureGroups = [];
// كائنات التصدير
let tourExporter;
let projectManager = new ProjectManager();
// 
// دالة createMeasureLine - شكل مسطرة حقيقي
// =======================================
function createMeasureLine(point1, point2) {
    const group = new THREE.Group();
    
    const start = point1.clone();
    const end = point2.clone();
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // ===== 1. الجسم الرئيسي للمسطرة =====
    const lineGeo = new THREE.CylinderGeometry(3, 3, distance, 12);
    const lineMat = new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0x442200,
        emissiveIntensity: 0.5
    });
    const line = new THREE.Mesh(lineGeo, lineMat);
    
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
    );
    line.applyQuaternion(quaternion);
    line.position.copy(midPoint);
    group.add(line);
    
    // ===== 2. أطراف المسطرة (كرات كبيرة) =====
    const sphereGeo = new THREE.SphereGeometry(6, 24, 24);
    const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0x442200,
        emissiveIntensity: 0.8
    });
    
    const sphere1 = new THREE.Mesh(sphereGeo, sphereMat);
    sphere1.position.copy(start);
    group.add(sphere1);
    
    const sphere2 = new THREE.Mesh(sphereGeo, sphereMat);
    sphere2.position.copy(end);
    group.add(sphere2);
    
    // ===== 3. علامات المسطرة (تدرجات) =====
    const numMarks = Math.floor(distance / 2.5); // علامة كل 2.5 وحدة
    for (let i = 1; i < numMarks; i++) {
        const t = i / numMarks;
        const pos = new THREE.Vector3().lerpVectors(start, end, t);
        
        // علامات كبيرة وصغيرة
        const isBigMark = i % 4 === 0;
        const markHeight = isBigMark ? 6 : 3;
        const markWidth = isBigMark ? 1.5 : 0.8;
        
        const markGeo = new THREE.BoxGeometry(markWidth, markHeight, markWidth);
        const markMat = new THREE.MeshStandardMaterial({ 
            color: isBigMark ? 0xffffff : 0xffaa44,
            emissive: isBigMark ? 0x333333 : 0x221100
        });
        const mark = new THREE.Mesh(markGeo, markMat);
        mark.position.copy(pos);
        mark.quaternion.copy(quaternion);
        group.add(mark);
    }
    
    return group;
}

// =======================================
// دالة createMeasureLabel - نسخة فائقة التكبير
// =======================================
function createMeasureLabel(text, position) {
    const group = new THREE.Group();
    
    // Canvas خيالي
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = 4096;        // عملاق
    canvas.height = 2048;        // عملاق
    
    // خلفية سوداء
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // إطار ذهبي سميك
    ctx.strokeStyle = '#ffaa44';
    ctx.lineWidth = 80;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
    
    // إطار داخلي
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.strokeRect(120, 120, canvas.width - 240, canvas.height - 240);
    
    // نص عملاق جداً
    ctx.font = 'bold 800px "Arial", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text + ' m', canvas.width / 2, canvas.height / 2);
    
    // ظل قوي
    ctx.shadowColor = '#ffaa44';
    ctx.shadowBlur = 100;
    ctx.fillText(text + ' m', canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: false
    });
    
    const sprite = new THREE.Sprite(material);
    
    // حجم خيالي
    sprite.scale.set(120, 60, 1);  // 120 وحدة عرض!
    
    // رفعه عالياً جداً
    const labelPos = position.clone().add(new THREE.Vector3(0, 80, 0));
    sprite.position.copy(labelPos);
    
    group.add(sprite);
    
    // خط رابط سميك وواضح
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        position,
        labelPos
    ]);
    const lineMat = new THREE.LineBasicMaterial({ 
        color: 0xffaa44,
        linewidth: 10
    });
    const line = new THREE.Line(lineGeo, lineMat);
    group.add(line);
    
    return group;
}
// تفعيل/إلغاء وضع القياس
function setMeasureMode(active) {
    measureMode = active;
    
    const measureBtn = document.getElementById('toggleMeasure');
    if (measureBtn) {
        if (active) {
            measureBtn.classList.add('active');
            measureBtn.textContent = '📏 إيقاف القياس';
            measureBtn.style.background = '#884488';
        } else {
            measureBtn.classList.remove('active');
            measureBtn.textContent = '📏 تفعيل القياس';
            measureBtn.style.background = 'rgba(136, 68, 136, 0.4)';
        }
    }
    
    // إيقاف الرسم إذا كان مفعلاً
    if (active && typeof drawMode !== 'undefined' && drawMode) {
        setDrawMode(false);
    }
    
    // إعادة تعيين
    measureStartPoint = null;
    if (measureTempLine) {
        scene.remove(measureTempLine);
        measureTempLine = null;
    }
    
    document.body.style.cursor = active ? 'crosshair' : 'default';
    
    const statusEl = document.getElementById('status');
    if (statusEl) {
        if (active) {
            statusEl.innerHTML = '📏 وضع القياس: اختر النقطة الأولى';
        } else {
            statusEl.innerHTML = 'النوع الحالي: <span style="color:#ffcc00;">EL</span>';
        }
    }
}

// معالجة النقر للقياس
// معالجة النقر للقياس
function handleMeasureClick(point) {
    if (!measureStartPoint) {
        // النقطة الأولى
        measureStartPoint = point.clone();
        
        // مؤشر مؤقت
        const markerGeo = new THREE.SphereGeometry(5, 16, 16);
        const markerMat = new THREE.MeshStandardMaterial({ 
            color: 0xffaa44,
            emissive: 0x442200
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.copy(measureStartPoint);
        scene.add(marker);
        measureTempLine = marker;
        
        document.getElementById('status').innerHTML = '📏 اختر النقطة الثانية';
        
    } else {
        // النقطة الثانية
        const endPoint = point.clone();
        
        // إزالة المؤشر
        if (measureTempLine) {
            scene.remove(measureTempLine);
            measureTempLine = null;
        }
        
        // حساب المسافة
        const distance = measureStartPoint.distanceTo(endPoint);
        
        // إدخال الطول
        const realLength = prompt('📏 أدخل الطول (بالمتر):', distance.toFixed(2));
        if (realLength === null) {
            measureStartPoint = null;
            return;
        }
        
        // إدخال الارتفاع
        const realHeight = prompt('📏 أدخل الارتفاع (بالمتر):', '0');
        if (realHeight === null) {
            measureStartPoint = null;
            return;
        }
        
        // إنشاء الخط
        const lineGroup = createMeasureLine(measureStartPoint, endPoint);
        scene.add(lineGroup);
        measureGroups.push(lineGroup);
        
        // 🔴 🔴 🔴 الأهم: إنشاء الملصق وإضافته للمشهد
        const midPoint = new THREE.Vector3().addVectors(measureStartPoint, endPoint).multiplyScalar(0.5);
        const labelGroup = createMeasureLabel(realLength, midPoint);
        scene.add(labelGroup);  // ✅ هذا السطر كان ناقصاً!
        measureGroups.push(labelGroup);
        
        console.log('✅ تم إضافة الملصق:', realLength + 'm');
        
        // حفظ القياس
        const measurement = {
            id: `measure-${Date.now()}`,
            start: { x: measureStartPoint.x, y: measureStartPoint.y, z: measureStartPoint.z },
            end: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
            length: parseFloat(realLength),
            height: parseFloat(realHeight),
            sceneId: sceneManager.currentScene?.id
        };
        
        if (sceneManager) {
            sceneManager.addMeasurement(sceneManager.currentScene.id, measurement);
        }
        
        // رسالة نجاح
        alert(`✅ تم القياس: ${realLength} m`);
        
        // إعادة تعيين
        measureStartPoint = null;
        document.getElementById('status').innerHTML = 'النوع الحالي: <span style="color:#ffcc00;">EL</span>';
    }
}

// إظهار القياسات لمشهد معين
function showMeasurementsForScene(sceneId) {
    // إزالة القياسات القديمة
    measureGroups.forEach(group => scene.remove(group));
    measureGroups = [];
    
    // إضافة قياسات المشهد الجديد
    const measurements = sceneManager.measurements[sceneId] || [];
    measurements.forEach(m => {
        const start = new THREE.Vector3(m.start.x, m.start.y, m.start.z);
        const end = new THREE.Vector3(m.end.x, m.end.y, m.end.z);
        
        const lineGroup = createMeasureLine(start, end);
        scene.add(lineGroup);
        measureGroups.push(lineGroup);
        
        const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const labelGroup = createMeasureLabel(m.length, midPoint);
        scene.add(labelGroup);
        measureGroups.push(labelGroup);
    });
}
// =======================================
// ٨. دوال الرسم (محدثة)
// =======================================
function setupMarkerPreview() {
    const geometry = new THREE.SphereGeometry(8, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.8
    });
    markerPreview = new THREE.Mesh(geometry, material);
    scene.add(markerPreview);
    markerPreview.visible = false;
}

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// دالة onClick المحدثة (بدون تكرار)
function onClick(e) {
    if (!sphereMesh || e.target !== renderer.domElement) return;
    
    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        const point = hits[0].point.clone();

        // ======== القياس له الأولوية ========
        if (measureMode) {
            handleMeasureClick(point);
            return;
        }
        // =====================================

        if (hotspotMode) {
            addHotspot(point);
            hotspotMode = null;
            document.body.style.cursor = 'default';
        } else if (drawMode) {
            addPoint(point);
        }
    }
}

function onMouseMove(e) {
    if (!drawMode || !sphereMesh || !markerPreview) {
        if (markerPreview) markerPreview.visible = false;
        return;
    }
    
    if (e.target !== renderer.domElement) {
        markerPreview.visible = false;
        return;
    }

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        markerPreview.position.copy(hits[0].point);
        markerPreview.visible = true;
    } else {
        markerPreview.visible = false;
    }
}

function addPoint(pos) {
    selectedPoints.push(pos.clone());
    console.log(`📍 نقطة ${selectedPoints.length} مضافة`);
    addPointMarker(pos);
    updateTempLine();
}

function addPointMarker(position) {
    const geometry = new THREE.SphereGeometry(6, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.6
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    scene.add(marker);
    pointMarkers.push(marker);
}

function updateTempLine() {
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
    if (selectedPoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(selectedPoints);
        const material = new THREE.LineBasicMaterial({ color: pathColors[currentPathType] });
        tempLine = new THREE.Line(geometry, material);
        scene.add(tempLine);
    }
}

function clearCurrentDrawing() {
    selectedPoints = [];
    pointMarkers.forEach(m => scene.remove(m));
    pointMarkers = [];
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
}

function saveCurrentPath() {
    if (selectedPoints.length < 2) {
        alert('⚠️ أضف نقطتين على الأقل');
        return;
    }
    if (tempLine) scene.remove(tempLine);
    createStraightPath(selectedPoints);
    clearCurrentDrawing();
    
    if (sceneManager && sceneManager.currentScene) {
        sceneManager.currentScene.paths = paths.map(p => ({
            type: p.userData.type,
            color: '#' + pathColors[p.userData.type].toString(16).padStart(6, '0'),
            points: p.userData.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
        }));

    sceneManager.saveScenes();
    }
    console.log('✅ تم حفظ المسار');
}

function createStraightPath(points) {
    if (points.length < 2) return;
    
    const color = pathColors[currentPathType];
    const pathId = `path-${Date.now()}-${Math.random()}`;
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        const direction = new THREE.Vector3().subVectors(end, start);
        const distance = direction.length();
        if (distance < 5) continue;
        
        const cylinderGeo = new THREE.CylinderGeometry(3.5, 3.5, distance, 12);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        
        const cylinder = new THREE.Mesh(cylinderGeo, new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4
        }));
        cylinder.applyQuaternion(quaternion);
        
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        cylinder.position.copy(center);
        
        cylinder.userData = { type: currentPathType, pathId: pathId, points: [start.clone(), end.clone()] };
        scene.add(cylinder);
        paths.push(cylinder);
    }
}

// دالة setDrawMode المحدثة
function setDrawMode(active) {
    drawMode = active;
    const drawBtn = document.getElementById('toggleDraw');
    if (drawBtn) {
        drawBtn.textContent = active ? '⛔ إيقاف الرسم' : '✏️ تفعيل الرسم';
        drawBtn.style.background = active ? '#aa3333' : 'rgba(143, 108, 74, 0.4)';
    }
    
    // إيقاف القياس إذا كان مفعلاً
    if (active && measureMode) {
        setMeasureMode(false);
    }
    
    document.body.style.cursor = active ? 'crosshair' : 'default';
    if (markerPreview) markerPreview.visible = active;
    controls.autoRotate = active ? false : autorotate;
    if (!active) clearCurrentDrawing();
}

// =======================================
// ٩. دوال Hotspots
// =======================================
function addHotspot(position) {
    if (!sceneManager || !sceneManager.currentScene) {
        alert('❌ لا يوجد مشهد نشط');
        return;
    }

    if (hotspotMode === 'INFO') {
        const title = prompt('📝 أدخل عنوان المعلومات:');
        if (!title) return;
        const content = prompt('📄 أدخل نص المعلومات:');
        if (!content) return;

        const data = { title, content };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene.id,
            'INFO',
            position,
            data
        );

        if (hotspot) {
            HotspotSystem.create(position, 'INFO', data, hotspot.id);
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة معلومات: "${title}"`, 'info');
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }

    } else if (hotspotMode === 'SCENE') {
        const otherScenes = sceneManager.scenes.filter(s => s.id !== sceneManager.currentScene.id);

        if (otherScenes.length === 0) {
            alert('❌ لا يوجد مشاهد أخرى للانتقال إليها');
            return;
        }

        let sceneList = '';
        otherScenes.forEach((s, index) => {
            sceneList += `${index + 1}. ${s.name}\n`;
        });

        const choice = prompt(
            `اختر المشهد للانتقال إليه:\n\n${sceneList}\nأدخل رقم المشهد:`
        );

        if (!choice) return;

        const selectedIndex = parseInt(choice) - 1;
        if (selectedIndex < 0 || selectedIndex >= otherScenes.length) {
            alert('❌ اختيار غير صالح');
            return;
        }

        const targetScene = otherScenes[selectedIndex];
        const description = prompt(`📝 أدخل وصفاً لهذه النقطة:`) || `انتقال إلى ${targetScene.name}`;

        const data = {
            targetSceneId: targetScene.id,
            targetSceneName: targetScene.name,
            description
        };

        const hotspot = sceneManager.addHotspot(
            sceneManager.currentScene ? sceneManager.currentScene.id : null
            'SCENE',
            position,
            data
        );

        if (hotspot) {
            HotspotSystem.create(position, 'SCENE', data, hotspot.id);
            showCustomInfoWindow('✅ تمت الإضافة', `تم إضافة نقطة انتقال إلى: "${targetScene.name}"`, 'scene');
            if (typeof updateScenePanel === 'function') updateScenePanel();
        }
    }

    hotspotMode = null;
    document.body.style.cursor = 'default';
}

window.editHotspotFromUI = function(hotspotId) {
    editHotspot(hotspotId);
};

window.deleteHotspotFromUI = function(hotspotId) {
    if (confirm('🗑️ هل أنت متأكد من حذف هذه النقطة؟')) {
        deleteHotspotById(hotspotId);
        HotspotSystem.remove(hotspotId);
    }
};

function deleteHotspotById(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    sceneManager.currentScene.hotspots = sceneManager.currentScene.hotspots.filter(
        h => h.id !== hotspotId
    );

    sceneManager.saveScenes();
    updateScenePanel();
    showCustomInfoWindow('✅ تم الحذف', 'تم حذف النقطة بنجاح', 'info');
}

function editHotspot(hotspotId) {
    if (!sceneManager || !sceneManager.currentScene) return;

    const hotspot = sceneManager.currentScene.hotspots.find(h => h.id === hotspotId);
    if (!hotspot) return;

    if (hotspot.type === 'INFO') {
        const newTitle = prompt('✏️ تعديل عنوان المعلومات:', hotspot.data.title || '');
        if (newTitle === null) return;
        const newContent = prompt('✏️ تعديل نص المعلومات:', hotspot.data.content || '');
        if (newContent === null) return;

        hotspot.data.title = newTitle;
        hotspot.data.content = newContent;
    } else {
        const otherScenes = sceneManager.scenes.filter(s => s.id !== sceneManager.currentScene.id);
        if (otherScenes.length > 0) {
            let sceneList = '';
            otherScenes.forEach((s, index) => {
                sceneList += `${index + 1}. ${s.name}\n`;
            });
            const choice = prompt(
                `تعديل المشهد المستهدف:\n${sceneList}\nأدخل الرقم الجديد (أو اتركه فارغاً للإبقاء):`
            );
            if (choice) {
                const idx = parseInt(choice) - 1;
                if (idx >= 0 && idx < otherScenes.length) {
                    hotspot.data.targetSceneId = otherScenes[idx].id;
                    hotspot.data.targetSceneName = otherScenes[idx].name;
                }
            }
        }

    const newDesc = prompt('✏️ تعديل الوصف:', hotspot.data.description || '');
        if (newDesc !== null) {
            hotspot.data.description = newDesc;
        }
    }

    sceneManager.saveScenes();
    HotspotSystem.remove(hotspotId);
    const pos = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);
    HotspotSystem.create(pos, hotspot.type, hotspot.data, hotspotId);
    
    showCustomInfoWindow('✅ تم التحديث', 'تم تحديث بيانات النقطة بنجاح', 'info');
}

function showCustomInfoWindow(title, content, type = 'info') {
    const oldWindow = document.querySelector('.custom-info-window');
    if (oldWindow) oldWindow.remove();
    
    const colors = {
        info: '#ffaa44',
        scene: '#44aaff',
        success: '#44ff44',
        error: '#ff4444'
    };
    
    const icons = {
        info: 'icon/info.png',
        scene: 'icon/hotspot.png',
        success: '✅',
        error: '❌'
    };
    
    const win = document.createElement('div');
    win.className = 'custom-info-window';
    win.style.borderColor = colors[type] || colors.info;
    
    win.innerHTML = `
        <div class="window-header" style="border-bottom-color: ${colors[type]};">
            ${typeof icons[type] === 'string' && icons[type].includes('.png') 
                ? `<img src="${icons[type]}" style="width: 30px; height: 30px;">` 
                : `<span style="font-size: 24px;">${icons[type]}</span>`
            }
            <h3 style="color: ${colors[type]};">${title}</h3>
        </div>
        <div class="window-content">
            ${content}
        </div>
        <button class="window-close" style="border-color: ${colors[type]};" onclick="this.parentElement.remove()">حسناً</button>
    `;

    document.body.appendChild(win);
    
    setTimeout(() => {
        if (win.parentElement) win.remove();
    }, 3000);
}
// =======================================
// ١٠. تحديث لوحة المشاهد
// =======================================

function updateScenePanel() {
    const list = document.getElementById('sceneList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!sceneManager || !sceneManager.scenes) return;
    
    // ترتيب حسب order (الأقدم أولاً)
    const sortedScenes = [...sceneManager.scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    sortedScenes.forEach((scene, index) => {
        const item = document.createElement('div');
        item.className = 'scene-item';
        
        if (sceneManager.currentScene && sceneManager.currentScene.id === scene.id) {
            item.classList.add('active');
        }
        
        const infoCount = scene.hotspots?.filter(h => h.type === 'INFO').length || 0;
        const sceneCount = scene.hotspots?.filter(h => h.type === 'SCENE').length || 0;
        const totalPoints = infoCount + sceneCount;
        
        item.innerHTML = `
            <span class='scene-icon'>${index === 0 ? '🏠' : '🌄'}</span>
            <span class='scene-name' title='${scene.name}'>${index + 1}. ${scene.name}</span>
            <span class='scene-hotspots'>${totalPoints}</span>
            <button class='delete-scene-btn' data-id='${scene.id}' title='حذف المشهد'>🗑️</button>
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-scene-btn')) {
                sceneManager.switchToScene(scene.id);
                updateScenePanel();
            }
        });

        const deleteBtn = item.querySelector('.delete-scene-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('🗑️ هل أنت متأكد من حذف هذا المشهد؟')) {
                sceneManager.deleteScene(scene.id);
            }
        });
        
        list.appendChild(item);
    });

    // سكرول تلقائي للمشهد النشط
    setTimeout(() => {
        const activeItem = list.querySelector('.scene-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
} // ✅ قوس إغلاق واحد فقط للدالة
    
// =======================================
// تفعيل خاصية السحب والترتيب للمشاهد
// =======================================
function enableSceneSorting() {
    const sceneList = document.getElementById('sceneList');
    if (!sceneList) return;

    // التأكد من وجود المكتبة
    if (typeof Sortable === 'undefined') {
        console.warn('⚠️ SortableJS غير موجودة');
        return;
    }

    new Sortable(sceneList, {
        animation: 300, // سرعة الحركة (بالملي ثانية)
        handle: '.scene-item', // ما الذي نسحب
        draggable: '.scene-item', // العناصر القابلة للسحب
        ghostClass: 'scene-item-ghost', // كلاس العنصر أثناء السحب
        chosenClass: 'scene-item-chosen', // كلاس العنصر المختار
        dragClass: 'scene-item-drag', // كلاس أثناء السحب
        
        onEnd: function(evt) {
            // هذا الكود ينفذ بعد إنهاء السحب
            console.log('🔄 تم تغيير ترتيب المشاهد');
            
            // الحصول على الترتيب الجديد
            const items = evt.to.children;
            const newOrder = [];
            
            // نقرأ الـ IDs بالترتيب الجديد
            for (let i = 0; i < items.length; i++) {
                const deleteBtn = items[i].querySelector('.delete-scene-btn');
                if (deleteBtn) {
                    const sceneId = deleteBtn.getAttribute('data-id');
                    newOrder.push(sceneId);
                }
            }
            
            // إعادة ترتيب المشاهد في الذاكرة
            if (sceneManager && sceneManager.scenes) {
                const reorderedScenes = [];
                newOrder.forEach(id => {
                    const scene = sceneManager.scenes.find(s => s.id === id);
                    if (scene) reorderedScenes.push(scene);
                });
                
                // إضافة أي مشاهد مفقودة (للأمان)
                sceneManager.scenes.forEach(scene => {
                    if (!newOrder.includes(scene.id)) {
                        reorderedScenes.push(scene);
                    }
                });
                
                // تحديث المشاهد
                sceneManager.scenes = reorderedScenes;
                sceneManager.saveScenes();
                
                console.log('✅ تم حفظ الترتيب الجديد');
            }
        }
    });
    
    console.log('✅ تم تفعيل السحب والترتيب');
}

// استدعاء الدالة بعد تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableSceneSorting);
} else {
    enableSceneSorting();
}
// =======================================
// دوال التحميل والتصدير
// =======================================

function showLoader(message) {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.textContent = message || '⏳ جاري التحميل...';
    } else {
        // إذا لم يكن موجوداً، أنشئ واحداً
        const newLoader = document.createElement('div');
        newLoader.id = 'loader';
        newLoader.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            z-index: 10000;
            font-weight: 500;
            backdrop-filter: blur(8px);
        `;
        newLoader.textContent = message || '⏳ جاري التحميل...';
        document.body.appendChild(newLoader);
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    }
}
// =======================================
// ١١. إضافة مشهد جديد
// =======================================
function addNewScene() {
    // ✅ استخدام حقل إدخال مخصص بدلاً من prompt
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(20,30,40,0.95);
        padding: 30px;
        border-radius: 16px;
        z-index: 10000;
        direction: rtl;
        border: 2px solid #4a6c8f;
        color: white;
        min-width: 300px;
    `;
    
    modal.innerHTML = `
        <h3 style="margin-top:0;">📝 إضافة مشهد جديد</h3>
        <input type="text" id="sceneNameInput" placeholder="أدخل اسم المشهد" 
               style="width:100%; padding:10px; margin:10px 0; background:#1a2a3a; border:1px solid #4a6c8f; color:white; border-radius:6px;">
        <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button id="cancelSceneBtn" style="background:#c0392b; border:none; color:white; padding:8px 16px; border-radius:6px; cursor:pointer;">إلغاء</button>
            <button id="confirmSceneBtn" style="background:#27ae60; border:none; color:white; padding:8px 16px; border-radius:6px; cursor:pointer;">إضافة</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('cancelSceneBtn').onclick = () => modal.remove();
    document.getElementById('confirmSceneBtn').onclick = () => {
        const name = document.getElementById('sceneNameInput').value.trim();
        modal.remove();
        
        if (!name) {
            alert('❌ الرجاء إدخال اسم صحيح');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) {
                document.body.removeChild(input);
                return;
            }

            showLoader('جاري إضافة المشهد...');

            try {
                const scene = await sceneManager.addScene(name, file);
                if (scene) {
                    sceneManager.switchToScene(scene.id);
                    updateScenePanel();
                    hideLoader();
                    alert(`✅ تم إضافة المشهد: "${name}"`);
                }
            } catch (error) {
                console.error('❌ خطأ:', error);
                alert('فشل إضافة المشهد');
                hideLoader();
            }

            document.body.removeChild(input);
        };

        input.click();
    };
}
// =======================================
// ١٢. دوال التحميل والتصدير
// =======================================
// =======================================
// تصدير الجولة كاملة - نسخة تعتمد على tourExporter
// =======================================
async function exportCompleteTour() {
    if (!window.sceneManager || window.sceneManager.scenes.length === 0) {
        alert('❌ لا توجد مشاهد للتصدير');
        return;
    }

    // تعريف showLoader محلياً (احتياطي)
    function showLoader(message) {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.textContent = message || '⏳ جاري التحميل...';
        }
    }

    function hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    showLoader('جاري تحضير الجولة...');

    try {
        // استخدام sceneManager مباشرة
        const scenes = window.sceneManager.scenes;
        
        // تجهيز بيانات المشاهد للتصدير
        const exportScenes = scenes.map(s => ({
            id: s.id,
            name: s.name,
            originalImage: s.originalImage,
            paths: s.paths || [],
            hotspots: (s.hotspots || []).map(h => ({
                id: h.id,
                type: h.type,
                position: h.position,
                data: h.data || {}
            })),
            measurements: s.measurements || []
        }));

        // اسم المشروع
        const projectName = `tour-${Date.now()}`;

        // ✅ استخدام tourExporter الموجود (الذي يعرف generatePlayerHTML)
        await window.tourExporter.exportTour(projectName, exportScenes);

        hideLoader();
        alert(`✅ تم تصدير الجولة بنجاح!\n📁 الملف: ${projectName}.zip`);

    } catch (error) {
        console.error('❌ خطأ في التصدير:', error);
        alert('حدث خطأ في التصدير: ' + error.message);
        hideLoader();
    }
}
// =======================================
// مسح جميع المسارات
// =======================================
function clearAllPaths() {
    if (confirm('🗑️ هل أنت متأكد من مسح جميع المسارات؟')) {
        // إزالة جميع المسارات من المشهد
        paths.forEach(p => {
            if (p.parent) {
                p.parent.remove(p);
            } else {
                scene.remove(p);
            }
        });
        
        // تفريغ المصفوفات
        paths = [];
        
        // مسح الرسم الحالي
        if (typeof clearCurrentDrawing === 'function') {
            clearCurrentDrawing();
        }
        
        console.log('✅ تم مسح جميع المسارات');
    }
}
// =======================================
// ١٣. تحميل البانوراما
// =======================================
function loadPanorama() {
    console.log('🔄 جاري تحميل البانوراما...');
    
    const loader = new THREE.TextureLoader();
    loader.load(
        './textures/StartPoint.jpg',
        (texture) => {
            console.log('✅ تم تحميل الصورة');
            
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1;

            const geometry = new THREE.SphereGeometry(500, 64, 64);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide
            });

            sphereMesh = new THREE.Mesh(geometry, material);
            scene.add(sphereMesh);
            
            const loaderEl = document.getElementById('loader');
            if (loaderEl) loaderEl.style.display = 'none';
            
            setupMarkerPreview();
        },
        (progress) => {
            console.log(`⏳ التحميل: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        },
        (error) => {
            console.error('❌ فشل تحميل الصورة:', error);
        }
    );
}

// =======================================
// ١٤. دالة موحدة لتحميل المشاهد
// =======================================
function loadSceneImage(imageData) {
    if (!sphereMesh || !sphereMesh.material) return;

    const img = new Image();
    img.onload = () => {
        const texture = new THREE.CanvasTexture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        
        sphereMesh.material.map = texture;
        sphereMesh.material.needsUpdate = true;
        
        console.log('✅ تم تحميل المشهد الجديد');
    };
    img.src = imageData;
}

// =======================================
// ١٥. نظام الوضعيات
// =======================================
let currentMode = 'draw';

function setMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById('mode' + mode.charAt(0).toUpperCase() + mode.slice(1));
    if (activeBtn) activeBtn.classList.add('active');
    
    document.body.classList.remove('mode-draw', 'mode-view');
    document.body.classList.add('mode-' + mode);
    
    console.log('🔄 تم التبديل إلى وضع: ' + mode);
}

// =======================================
// ١٦. إعداد الأحداث (محدث)
// =======================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    
    const toggleRotate = document.getElementById('toggleRotate');
    if (toggleRotate) {
        toggleRotate.onclick = () => {
            autorotate = !autorotate;
            controls.autoRotate = autorotate;
            toggleRotate.textContent = autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
        };
    }

    const toggleDraw = document.getElementById('toggleDraw');
    if (toggleDraw) {
        toggleDraw.onclick = () => {
            setDrawMode(!drawMode);
        };
    }
    
    // إضافة حدث زر القياس
    const toggleMeasure = document.getElementById('toggleMeasure');
    if (toggleMeasure) {
        toggleMeasure.onclick = () => {
            setMeasureMode(!measureMode);
        };
    }

    const finalizePath = document.getElementById('finalizePath');
    if (finalizePath) finalizePath.onclick = saveCurrentPath;

    const clearAll = document.getElementById('clearAll');
    if (clearAll) clearAll.onclick = clearAllPaths;

    const hotspotScene = document.getElementById('hotspotScene');
    if (hotspotScene) {
        hotspotScene.onclick = () => {
            hotspotMode = 'SCENE';
            document.body.style.cursor = 'cell';
            setDrawMode(false);
            setMeasureMode(false);
        };
    }

    const hotspotInfo = document.getElementById('hotspotInfo');
    if (hotspotInfo) {
        hotspotInfo.onclick = () => {
            hotspotMode = 'INFO';
            document.body.style.cursor = 'cell';
            setDrawMode(false);
            setMeasureMode(false);
        };
    }

    const addSceneBtn = document.getElementById('addSceneBtn');
    if (addSceneBtn) addSceneBtn.onclick = addNewScene;

    const exportTour = document.getElementById('exportTour');
    if (exportTour) exportTour.onclick = exportCompleteTour;
}

// =======================================
// ١٧. أحداث لوحة المفاتيح
// =======================================
function onKeyDown(e) {
    if (!drawMode) return;
    switch(e.key) {
        case 'Enter': e.preventDefault(); saveCurrentPath(); break;
        case 'Backspace': e.preventDefault(); undoLastPoint(); break;
        case 'Escape': e.preventDefault(); clearCurrentDrawing(); break;
        case 'n': case 'N': e.preventDefault(); clearCurrentDrawing(); break;
        case '1': currentPathType = 'EL'; window.setCurrentPathType('EL'); break;
        case '2': currentPathType = 'AC'; window.setCurrentPathType('AC'); break;
        case '3': currentPathType = 'WP'; window.setCurrentPathType('WP'); break;
        case '4': currentPathType = 'WA'; window.setCurrentPathType('WA'); break;
        case '5': currentPathType = 'GS'; window.setCurrentPathType('GS'); break;
    }
}

function undoLastPoint() {
    if (selectedPoints.length > 0) {
        selectedPoints.pop();
        const last = pointMarkers.pop();
        if (last) scene.remove(last);
        updateTempLine();
    }
}

function onResize() {
    if (!camera || !renderer) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (HotspotSystem) {
        HotspotSystem.updatePositions();
    }
}

// =======================================
// ١٨. تهيئة أزرار الوضعيات
// =======================================
function initModeButtons() {
    const modeDraw = document.getElementById('modeDraw');
    const modeView = document.getElementById('modeView');
    
    if (modeDraw) modeDraw.onclick = () => setMode('draw');
    if (modeView) modeView.onclick = () => setMode('view');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModeButtons);
} else {
    initModeButtons();
}

// =======================================
// ١٩. التهيئة والتشغيل
// =======================================
function init() {
    console.log('🚀 بدء التهيئة...');
    
    const container = document.getElementById('container');
    if (!container) {
        console.error('❌ عنصر #container غير موجود في الصفحة');
        return;
    }

scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-1, -1, -0.5);
    scene.add(dirLight2);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autorotate;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);
    controls.update();

    // تهيئة الكائنات
sceneManager = new SceneManager();
tourExporter = new TourExporter(); // 👈 أضف هذا السطر
window.sceneManager = sceneManager;
window.tourExporter = tourExporter; // 👈 وهذا أيضاًلوصول العام
    
    loadPanorama();
    setupEvents();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    
    // تحديث مواقع الأيقونات فقط - بدون إعادة بناء
    if (HotspotSystem) {
        HotspotSystem.updatePositions();
    }
}
// =======================================
// التأكد من عمل السكرول بشكل صحيح
// =======================================
function fixScenePanelScroll() {
    const sceneList = document.getElementById('sceneList');
    const scenePanel = document.getElementById('scenePanel');
    
    if (!sceneList || !scenePanel) return;
    
    function updateScrollHeight() {
        const panelHeight = scenePanel.clientHeight;
        // ✅ تم التعديل هنا (إزالة ?.)
        const header = document.querySelector('.scene-panel .panel-header');
        const headerHeight = header ? header.clientHeight : 50;
        const availableHeight = panelHeight - headerHeight - 20;
        
        sceneList.style.maxHeight = availableHeight + 'px';
        sceneList.style.overflowY = 'auto';
        console.log('📐 تحديث ارتفاع السكرول:', availableHeight);
    }
    
    updateScrollHeight();
    window.addEventListener('resize', updateScrollHeight);
    
    console.log('✅ تم تفعيل السكرول الذكي');
}

// استدعاء الدالة بعد تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(fixScenePanelScroll, 200);
    });
} else {
    setTimeout(fixScenePanelScroll, 200);
}

// بدء التشغيل
init();
