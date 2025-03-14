const scene = new THREE.Scene();

// Set up the camera (perspective camera)
const camera = new THREE.PerspectiveCamera(
    75, // field of view
    window.innerWidth / window.innerHeight, // aspect ratio
    0.1, // near clipping plane
    1000 // far clipping plane
);
// Position the camera below the scene and look upwards
camera.position.set(5, 15, 20); 
camera.lookAt(0, 0, 0);
// Set up the WebGL renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Handle window resizing
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Create the floor (to provide context for the blocks)
const floorGeometry = new THREE.PlaneGeometry(30, 30); // Larger floor area
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; // Rotate to lie flat on the ground
floor.position.y = 0;
scene.add(floor);

// Create blocks for the image features (black dots)
const blockSize = 0.5; // Size of each block (cube)
const blockHeight = 1.5; // Height of each block
const blocks = new THREE.Group();

function addFeatureBlocks() {
    // Approximate major clusters of black dots from the image
    // Adjust these coordinates to match the exact positions in your image
    const features = [
        // Left-bottom cluster (around x=-8, z=-8 to -2)
    ];

    features.forEach(point => {
        const blockGeometry = new THREE.BoxGeometry(blockSize, blockHeight, blockSize);
        const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 }); // Black blocks for dots
        const block = new THREE.Mesh(blockGeometry, blockMaterial);
        block.position.set(point.x, blockHeight / 2, point.z); // Center the block at the dot position
        blocks.add(block);
    });
}

addFeatureBlocks();
scene.add(blocks);

// Add lighting
const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
scene.add(hemisphereLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Create a soldier (red cube) at the red "X" position
const soldierGeometry = new THREE.BoxGeometry(0.5, 1, 0.5);
const soldierMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const soldier = new THREE.Mesh(soldierGeometry, soldierMaterial);
// Position soldier at the red "X" (approximate from the image, around x=0, z=-5)
// soldier.position.set(0, 1, 0); // Adjust Z to -Z if needed
// scene.add(soldier);

// Debug overlay
const debugOverlay = document.createElement('div');
debugOverlay.style.position = 'absolute';
debugOverlay.style.top = '10px';
debugOverlay.style.left = '10px';
debugOverlay.style.color = 'white';
debugOverlay.style.background = 'rgba(0, 0, 0, 0.5)';
debugOverlay.style.padding = '5px';
document.body.appendChild(debugOverlay);

async function loadColmapData(cameraUrl, pointsUrl, scene) {
    const cameras = await fetch(cameraUrl).then(res => res.text());
    const points = await fetch(pointsUrl).then(res => res.text());

    const cameraParams = parseCameras(cameras);
    const pointCloud = parsePoints(points);

    visualizeCameras(cameraParams, scene);
    visualizePointCloud(pointCloud, scene);
}

function parseCameras(data) {
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));
    const cameras = [];

    for (let line of lines) {
        const [camera_id, model, width, height, fx, fy, cx, cy] = line.split(/\s+/).map(Number);
        cameras.push({ camera_id, width, height, fx, fy, cx, cy });
    }

    return cameras;
}

function parsePoints(data) {
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));
    const points = [];

    for (let line of lines) {
        const [point_id, x, y, z] = line.split(/\s+/).map(Number);
        points.push(new THREE.Vector3(x, y, z));
    }

    return points;
}

async function getNthCameraPosition(imagesUrl, n) {
    const data = await fetch(imagesUrl).then(res => res.text());
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));

    const imageLines = lines.filter((_, index) => index % 2 === 0); // Only camera lines

    if (n >= imageLines.length) {
        console.error("Camera index out of range");
        return null;
    }

    const [image_id, qw, qx, qy, qz, tx, ty, tz] = imageLines[n].split(/\s+/).map(Number);

    // Convert quaternion to rotation matrix
    const quaternion = new THREE.Quaternion(qx, qy, qz, qw);
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
    const translationVector = new THREE.Vector3(tx, ty, tz);

    // Compute camera world position C = -R^T * T
    const cameraPosition = translationVector.clone().applyMatrix4(rotationMatrix.clone().transpose()).negate();

    return cameraPosition;
}

// Function to draw line of sight for the nth camera
async function drawLineOfSight(imagesUrl, n) {
    const data = await fetch(imagesUrl).then(res => res.text());
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));

    const imageLines = lines.filter((_, index) => index % 2 === 0); // Only camera lines

    if (n >= imageLines.length) {
        console.error("Camera index out of range");
        return;
    }

    const [image_id, qw, qx, qy, qz, tx, ty, tz] = imageLines[n].split(/\s+/).map(Number);

    // Convert quaternion to rotation matrix
    const quaternion = new THREE.Quaternion(qx, qy, qz, qw);
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);

    // Compute camera world position C = -R^T * T
    const translationVector = new THREE.Vector3(tx, ty, tz);
    const cameraPosition = translationVector.clone().applyMatrix4(rotationMatrix.clone().transpose()).negate();

    // Calculate direction vector (assuming forward direction is along the negative Z-axis)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyMatrix4(rotationMatrix.clone().transpose()).normalize();
    forwardDir.x = -forwardDir.x; // Invert X

    // Use soldier's position as the starting point for the line of sight
    const soldierPosition = soldier.position.clone();
    soldierPosition.y = 0; // Adjust Y to start from the center of the soldier block

    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        soldierPosition,
        soldierPosition.clone().add(forwardDir.multiplyScalar(5)) // Extend line in the direction
    ]);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const line = new THREE.Line(lineGeometry, lineMaterial);

    // Add line to the scene
    scene.add(line);
}

// Function to smoothly move the soldier to the target position
function slideSoldierToPosition(targetPosition, duration) {
    const startPosition = soldier.position.clone();
    const startTime = performance.now();

    function updatePosition() {
        const elapsedTime = performance.now() - startTime;
        const t = Math.min(elapsedTime / duration, 1); // Calculate interpolation factor

        
        // Interpolate position
        soldier.position.lerpVectors(startPosition, targetPosition, t);
        soldier.position.y = 0;
        if (t < 1) {
            requestAnimationFrame(updatePosition);
        }
    }

    updatePosition();
}

// Modify setSoldierAtNthCameraPosition to use sliding
async function setSoldierAtNthCameraPosition(imagesUrl, n) {
    const position = await getNthCameraPosition(imagesUrl, n);
    if (position) {
        const targetPosition = new THREE.Vector3(position.x, position.y, -position.z); // Invert Z
        slideSoldierToPosition(targetPosition, 1000); // Slide over 1 second
        console.log(`Soldier sliding to Camera ${n}: (${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z})`);
    } else {
        console.error(`Failed to position soldier at Camera ${n}`);
    }
    scene.add(soldier);
}

// Define rotation parameters
const rotationRadius = 20; // Radius of the circle
const rotationSpeed = 0.002; // Speed of rotation
let angle = 0;

function animate() {
    requestAnimationFrame(animate);

    // Update camera position for circular rotation
    angle += rotationSpeed;
    camera.position.x = rotationRadius * Math.cos(angle);
    camera.position.z = rotationRadius * Math.sin(angle);
    camera.lookAt(0, 0, 0); // Keep looking at the center

    // Render the scene
    renderer.render(scene, camera);
}

// Define pairs of points for walls within the range -15 to 15
const wallPairs = [
    { start: new THREE.Vector3(-0.982, 0, -9.937), end: new THREE.Vector3(11.475, 0, 3.963) },
    { start: new THREE.Vector3(11.475, 0, 3.963), end: new THREE.Vector3(4.767, 0, 11.339) },
    { start: new THREE.Vector3(4.767, 0, 11.339), end: new THREE.Vector3(-4.14024, 0, 1.88082) },
    { start: new THREE.Vector3(-4.14024, 0, 1.88082), end: new THREE.Vector3(-8.60343, 0, 7.32546) },
    { start: new THREE.Vector3(-8.60343, 0, 7.32546), end: new THREE.Vector3(-11.8252, 0, 3.25773) },
    { start: new THREE.Vector3(-11.8252, 0, 3.25773), end: new THREE.Vector3(-0.982, 0, -9.937) },
];

// Function to create walls between pairs of points
function createWalls() {
    wallPairs.forEach(pair => {
        const start = pair.start;
        const end = pair.end;
        
        const wallHeight = 3

        // Calculate the midpoint and length of the wall
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const length = start.distanceTo(end);
        
        // Create the wall geometry and material
        const wallGeometry = new THREE.BoxGeometry(0.1, wallHeight, length); // Thin wall
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x404040 });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position and rotate the wall
        wall.position.set(midpoint.x, 0, midpoint.z);
        wall.lookAt(end);
        
        // Add the wall to the scene
        scene.add(wall);
    });
}

// Function to draw a triangle with the line of sight as the median
async function drawTriangleWithLineOfSight(imagesUrl, n, fieldOfViewAngle) {
    const data = await fetch(imagesUrl).then(res => res.text());
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));

    const imageLines = lines.filter((_, index) => index % 2 === 0); // Only camera lines

    if (n >= imageLines.length) {
        console.error("Camera index out of range");
        return;
    }

    const [image_id, qw, qx, qy, qz, tx, ty, tz] = imageLines[n].split(/\s+/).map(Number);

    // Convert quaternion to rotation matrix
    const quaternion = new THREE.Quaternion(qx, qy, qz, qw);
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);

    // Calculate direction vector (assuming forward direction is along the negative Z-axis)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyMatrix4(rotationMatrix.clone().transpose()).normalize();
    forwardDir.x = -forwardDir.x; // Invert X

    // Use soldier's position as the starting point for the line of sight
    const soldierPosition = soldier.position.clone();
    soldierPosition.y = 0; // Adjust Y to start from the center of the soldier block

    // Calculate the length of the line of sight
    const lineLength = 5;
    const endPoint = soldierPosition.clone().add(forwardDir.multiplyScalar(lineLength));

    // Calculate the angle in radians
    const angleRad = THREE.MathUtils.degToRad(fieldOfViewAngle / 2);

    // Calculate the positions of the other two vertices of the triangle
    const leftDir = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
    const rightDir = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angleRad);

    const leftPoint = soldierPosition.clone().add(leftDir.multiplyScalar(lineLength));
    const rightPoint = soldierPosition.clone().add(rightDir.multiplyScalar(lineLength));

    // Create triangle geometry
    const triangleGeometry = new THREE.BufferGeometry().setFromPoints([
        soldierPosition,
        leftPoint,
        rightPoint,
        soldierPosition // Close the triangle
    ]);

    const triangleMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const triangle = new THREE.LineLoop(triangleGeometry, triangleMaterial);

    // Add triangle to the scene
    scene.add(triangle);
}

// Array to keep track of lines added to the scene
let currentLines = [];

function drawRobotLocation(imagesUrl, n) {
    // Remove previous lines
    currentLines.forEach(line => scene.remove(line))
    
    setSoldierAtNthCameraPosition(imagesUrl, n).then(() => {
        drawLinesToWalls(imagesUrl, n, 60)
    });
}

// Initialize lines for left and right intersections
let leftLine, rightLine;

function initializeLines() {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    // Create initial geometries with dummy points
    const leftLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    leftLine = new THREE.Line(leftLineGeometry, lineMaterial);
    leftLine.position.y = 0.55;
    scene.add(leftLine);

    const rightLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    rightLine = new THREE.Line(rightLineGeometry, lineMaterial);
    rightLine.position.y = 0.55;
    scene.add(rightLine);
}

function updateLines(soldierPosition, leftIntersection, rightIntersection) {
    if (leftIntersection) {
        leftLine.geometry.setFromPoints([soldierPosition, leftIntersection]);
    }

    if (rightIntersection) {
        rightLine.geometry.setFromPoints([soldierPosition, rightIntersection]);
    }
}

// Call initializeLines once
initializeLines();

// Modify drawLinesToWalls to update existing lines
async function drawLinesToWalls(imagesUrl, n, fieldOfViewAngle) {
    const data = await fetch(imagesUrl).then(res => res.text());
    const lines = data.split("\n").filter(line => line && !line.startsWith("#"));

    const imageLines = lines.filter((_, index) => index % 2 === 0); // Only camera lines

    if (n >= imageLines.length) {
        console.error("Camera index out of range");
        return [];
    }

    const [image_id, qw, qx, qy, qz, tx, ty, tz] = imageLines[n].split(/\s+/).map(Number);

    // Convert quaternion to rotation matrix
    const quaternion = new THREE.Quaternion(qx, qy, qz, qw);
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);

    // Calculate direction vector (assuming forward direction is along the negative Z-axis)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyMatrix4(rotationMatrix.clone().transpose()).normalize();
    forwardDir.x = -forwardDir.x; // Invert X
    forwardDir.y = 0; // Ensure the direction is parallel to the floor

    // Use soldier's position as the starting point for the line of sight
    const soldierPosition = soldier.position.clone();
    soldierPosition.y = 0; // Adjust Y to start from the center of the soldier block

    // Calculate the angle in radians
    const angleRad = THREE.MathUtils.degToRad(fieldOfViewAngle / 2);

    // Calculate the left and right direction vectors
    const leftDir = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleRad).normalize();
    const rightDir = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angleRad).normalize();

    // Function to find intersection with walls
    function findIntersection(start, direction) {
        let closestIntersection = null;
        let minDistance = Infinity;

        wallPairs.forEach(pair => {
            const wallStart = pair.start;
            const wallEnd = pair.end;

            const wallDir = new THREE.Vector3().subVectors(wallEnd, wallStart).normalize();
            const wallNormal = new THREE.Vector3(-wallDir.z, 0, wallDir.x); // Perpendicular to the wall

            const denom = wallNormal.dot(direction);
            if (Math.abs(denom) > 1e-6) { // Avoid division by zero
                const t = new THREE.Vector3().subVectors(wallStart, start).dot(wallNormal) / denom;
                if (t > 0) {
                    const intersection = start.clone().add(direction.clone().multiplyScalar(t));
                    const distance = start.distanceTo(intersection);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestIntersection = intersection;
                    }
                }
            }
        });

        return closestIntersection;
    }

    // Find intersections
    const leftIntersection = findIntersection(soldierPosition, leftDir);
    const rightIntersection = findIntersection(soldierPosition, rightDir);

    // Update lines with new intersections
    updateLines(soldierPosition, leftIntersection, rightIntersection);

    return [leftIntersection, rightIntersection];
}

// Define the range of n values
const maxN = 363; // Example maximum value for n
let currentN = 0;

// Function to update the scene for the current n value
async function updateSceneForN(n) {
    await drawRobotLocation("images.txt", n);
}

// Use setTimeout to iterate through n values with a pause
function iterateThroughN() {
    
    if (currentN < maxN/2) {
        soldier.material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Set soldier color to red
        updateSceneForN(currentN).then(() => {
            currentN++;
            setTimeout(iterateThroughN, 1); 
        });
    }
    else if (currentN >= maxN/2 && currentN < maxN) {
        soldier.material = new THREE.MeshStandardMaterial({ color: 0x0000ff }); // Set soldier color to blue
        updateSceneForN(currentN).then(() => {
            currentN++;
            setTimeout(iterateThroughN, 1); 
        });
    }
}

// Start the iteration
iterateThroughN();

createWalls();

animate();

