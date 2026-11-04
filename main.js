import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const container = document.querySelector("#telescope-view");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 5, 5);
scene.add(light);

const loader = new GLTFLoader();

loader.load(
  "assets/telescope.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // 把模型移到场景中心
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(sphere.center);

    // 根据模型尺寸调整相机距离
    const radius = Math.max(sphere.radius, 0.1);
    const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.4;

    camera.position.set(0, 0, distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    console.log("望远镜模型已加载");
  },
  undefined,
  (error) => {
    console.error("模型加载失败，请检查 assets/telescope.glb 路径：", error);
  }
);

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", resize);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();