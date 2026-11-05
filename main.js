import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const container = document.querySelector("#telescope-view");

// 数字越大，像素块越明显
const PIXEL_SIZE = 3;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: true,
});

renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5; // 数字越大，整体越亮
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.imageRendering = "pixelated";
container.appendChild(renderer.domElement);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let telescopeModel = null;

// 环境反射：让金属在各个方向都有可反射的光
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();

const environmentTarget = pmremGenerator.fromScene(
  roomEnvironment,
  0.04
);

scene.environment = environmentTarget.texture;

roomEnvironment.dispose();
pmremGenerator.dispose();

// 柔和的基础照明
scene.add(
  new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 1)
);

// 正面主灯，保留立体感
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 5, 5);
scene.add(light);

// 背面补光
const backLight = new THREE.DirectionalLight(0xffffff, 1.5);
backLight.position.set(-3, 2, -5);
scene.add(backLight);

// 鼠标拖动旋转，滚轮缩放
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

// 按容器实际大小调整画布；内部低分辨率产生像素效果
function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(
    Math.max(1, Math.round(width / PIXEL_SIZE)),
    Math.max(1, Math.round(height / PIXEL_SIZE)),
    false
  );
}

window.addEventListener("resize", resize);
resize();

// 加载模型并自动居中、调整镜头
const loader = new GLTFLoader();

loader.load(
  "assets/telescope.glb",
  (gltf) => {
    const modelGroup = new THREE.Group();
    modelGroup.add(gltf.scene);
    scene.add(modelGroup);

    telescopeModel = modelGroup;

    const bounds = new THREE.Box3().setFromObject(modelGroup);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());

    modelGroup.position.sub(sphere.center);

    const radius = Math.max(sphere.radius, 0.1);
    const distance =
      (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.4;

    camera.position.set(distance * 0.25, radius * 0.2, distance);
    camera.lookAt(0, 0, 0);

    controls.target.set(0, 0, 0);
    controls.minDistance = radius * 0.8;
    controls.maxDistance = distance * 4;
    controls.update();

    console.log("望远镜模型加载成功");
  },
  undefined,
  (error) => {
    console.error("模型加载失败，请检查 assets/telescope.glb 的路径：", error);
  }
);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

renderer.domElement.addEventListener("dblclick", (event) => {
  if (!telescopeModel) return;

  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(telescopeModel, true);

  if (hits.length > 0) {
    window.location.href = "./telescope.html";
  }
});