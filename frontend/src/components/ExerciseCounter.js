import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';

const ExerciseCounter = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [exerciseType, setExerciseType] = useState('pushups');
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('up');
  const [repProgress, setRepProgress] = useState(0);
  const pose = useRef(null);
  const cameraRef = useRef(null);
  
  // Refs for movement tracking
  const lastAngle = useRef(0);
  const movementDirection = useRef('none');
  const repInProgress = useRef(false);
  
  // Smoothing buffers
  const angleBuffer = useRef([]);
  const BUFFER_SIZE = 10;
  const lastValidation = useRef(Date.now());
  const VALIDATION_DELAY = 500;

  const POSE_CONNECTIONS = [
    [11, 12], [11, 23], [12, 24], [23, 24],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [23, 25], [25, 27], [24, 26], [26, 28],
  ];

  const calculateAngle = useCallback((a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    return angle > 180 ? 360 - angle : angle;
  }, []);

  const calculateProgress = useCallback((currentAngle, maxAngle, minAngle) => {
    return Math.max(0, Math.min(1, (maxAngle - currentAngle) / (maxAngle - minAngle)));
  }, []);

  const drawKeypoints = useCallback((landmarks, ctx) => {
    for (let i = 0; i < landmarks.length; i++) {
      const x = landmarks[i].x * canvasRef.current.width;
      const y = landmarks[i].y * canvasRef.current.height;
      const visibility = landmarks[i].visibility;

      if (visibility > 0.65) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "rgb(255, 255, 255)";
        ctx.strokeStyle = "rgb(0, 255, 0)";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    }
  }, []);

  const drawSkeleton = useCallback((landmarks, ctx) => {
    ctx.strokeStyle = "rgb(0, 255, 0)";
    ctx.lineWidth = 2;

    POSE_CONNECTIONS.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];

      if (startPoint.visibility > 0.65 && endPoint.visibility > 0.65) {
        ctx.beginPath();
        ctx.moveTo(
          startPoint.x * canvasRef.current.width,
          startPoint.y * canvasRef.current.height
        );
        ctx.lineTo(
          endPoint.x * canvasRef.current.width,
          endPoint.y * canvasRef.current.height
        );
        ctx.stroke();
      }
    });
  }, []);

  const drawAngle = useCallback((ctx, point, angle) => {
    const x = point.x * canvasRef.current.width;
    const y = point.y * canvasRef.current.height;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.font = "bold 20px Arial";
    ctx.strokeText(`${Math.round(angle)}°`, x + 10, y - 10);
    ctx.fillText(`${Math.round(angle)}°`, x + 10, y - 10);
  }, []);

  const drawProgressBar = useCallback((ctx, progress) => {
    const barWidth = 300;
    const barHeight = 30;
    const x = (canvasRef.current.width - barWidth) / 2;
    const y = canvasRef.current.height - 50;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x, y, barWidth, barHeight);

    const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
    gradient.addColorStop(0, "#00ff00");
    gradient.addColorStop(1, "#ff0000");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth * progress, barHeight);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barWidth, barHeight);
  }, []);

  const drawStatusIndicator = useCallback((ctx, status, angle) => {
    const x = 20;
    const y = 50;
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = status === 'down' ? '#FF0000' : '#00FF00';
    ctx.fillText(`Status: ${status.toUpperCase()} (${Math.round(angle)}°)`, x, y);
  }, []);

  const smoothAngle = useCallback((currentAngle) => {
    angleBuffer.current.push(currentAngle);
    
    if (angleBuffer.current.length > BUFFER_SIZE) {
      angleBuffer.current.shift();
    }
    
    const sum = angleBuffer.current.reduce((a, b) => a + b, 0);
    return sum / angleBuffer.current.length;
  }, []);

  const detectRepMovement = useCallback((currentAngle, downThreshold, upThreshold) => {
    const smoothedAngle = smoothAngle(currentAngle);
    const now = Date.now();
    const timeSinceLastValidation = now - lastValidation.current;
    
    if (smoothedAngle < lastAngle.current - 1) {
      movementDirection.current = 'down';
    } else if (smoothedAngle > lastAngle.current + 1) {
      movementDirection.current = 'up';
    }

    if (smoothedAngle <= downThreshold && !repInProgress.current && 
        movementDirection.current === 'down' && timeSinceLastValidation >= VALIDATION_DELAY) {
      repInProgress.current = true;
      setStatus('down');
      lastValidation.current = now;
    }

    if (smoothedAngle >= upThreshold && repInProgress.current && 
        movementDirection.current === 'up' && timeSinceLastValidation >= VALIDATION_DELAY) {
      repInProgress.current = false;
      setStatus('up');
      setCount(prev => prev + 1);
      lastValidation.current = now;
    }

    lastAngle.current = smoothedAngle;
    return smoothedAngle;
  }, []);

  const checkPushupForm = useCallback((landmarks, ctx) => {
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const elbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
    
    const smoothedAngle = detectRepMovement(elbowAngle, 85, 160);
    const progress = calculateProgress(smoothedAngle, 160, 85);
    setRepProgress(progress);
    
    drawAngle(ctx, leftElbow, smoothedAngle);
    drawProgressBar(ctx, progress);
    drawStatusIndicator(ctx, status, smoothedAngle);
  }, [calculateAngle, detectRepMovement, calculateProgress, drawAngle, drawProgressBar, drawStatusIndicator, status]);

  const checkSquatForm = useCallback((landmarks, ctx) => {
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    
    // Adjust thresholds based on actual squat depth
    const downThreshold = 90; // Lower this value for deeper squats
    const upThreshold = 165;
    
    const smoothedAngle = detectRepMovement(kneeAngle, downThreshold, upThreshold);
    
    // Calculate progress - ensure it can reach 100%
    let progress;
    if (smoothedAngle <= downThreshold) {
      progress = 1; // Fully down position
    } else if (smoothedAngle >= upThreshold) {
      progress = 0; // Fully up position
    } else {
      progress = 1 - ((smoothedAngle - downThreshold) / (upThreshold - downThreshold));
    }
    
    setRepProgress(progress);
    
    drawAngle(ctx, leftKnee, smoothedAngle);
    drawProgressBar(ctx, progress);
    drawStatusIndicator(ctx, status, smoothedAngle);
  }, [calculateAngle, detectRepMovement, drawAngle, drawProgressBar, drawStatusIndicator, status]);

  const checkSitupForm = useCallback((landmarks, ctx) => {
    const leftShoulder = landmarks[11];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    
    const torsoAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    const smoothedAngle = detectRepMovement(torsoAngle, 75, 130);
    const progress = calculateProgress(smoothedAngle, 130, 75);
    setRepProgress(progress);
    
    drawAngle(ctx, leftHip, smoothedAngle);
    drawProgressBar(ctx, progress);
    drawStatusIndicator(ctx, status, smoothedAngle);
  }, [calculateAngle, detectRepMovement, calculateProgress, drawAngle, drawProgressBar, drawStatusIndicator, status]);

  const processResults = useCallback((results) => {
    if (!results.poseLandmarks) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    drawSkeleton(results.poseLandmarks, ctx);
    drawKeypoints(results.poseLandmarks, ctx);

    switch (exerciseType) {
      case 'pushups':
        checkPushupForm(results.poseLandmarks, ctx);
        break;
      case 'squats':
        checkSquatForm(results.poseLandmarks, ctx);
        break;
      case 'situps':
        checkSitupForm(results.poseLandmarks, ctx);
        break;
      default:
        break;
    }

    ctx.restore();
  }, [exerciseType, drawSkeleton, drawKeypoints, checkPushupForm, checkSquatForm, checkSitupForm]);

  useEffect(() => {
    const initializePose = async () => {
      pose.current = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      pose.current.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      pose.current.onResults(processResults);
    };

    initializePose();
  }, [processResults]);

  useEffect(() => {
    if (webcamRef.current && webcamRef.current.video) {
      cameraRef.current = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (pose.current) {
            await pose.current.send({ image: webcamRef.current.video });
          }
        },
        width: 640,
        height: 480
      });

      cameraRef.current.start();
    }
  }, [webcamRef]);

  return (
    <div className="exercise-counter">
      <div className="video-container relative">
        <Webcam
          ref={webcamRef}
          className="webcam absolute top-0 left-0"
          width={640}
          height={480}
        />
        <canvas
          ref={canvasRef}
          className="canvas absolute top-0 left-0"
          width={640}
          height={480}
        />
      </div>
      <div className="controls mt-4 p-4 bg-gray-800 rounded-lg">
        <select
          value={exerciseType}
          onChange={(e) => {
            setExerciseType(e.target.value);
            setCount(0);
            setStatus('up');
            repInProgress.current = false;
            movementDirection.current = 'none';
            angleBuffer.current = [];
            lastValidation.current = Date.now();
          }}
          className="bg-gray-700 text-white p-2 rounded-md mr-4"
        >
          <option value="pushups">Pushups</option>
          <option value="squats">Squats</option>
          <option value="situps">Situps</option>
        </select>
        <div className="counter text-white text-2xl font-bold my-2">
          Reps: {count}
        </div>
        <button
          onClick={() => {
            setCount(0);
            setStatus('up');
            repInProgress.current = false;
            movementDirection.current = 'none';
            angleBuffer.current = [];
            lastValidation.current = Date.now();
          }}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md"
        >
          Reset Counter
        </button>
      </div>
    </div>
  );
};

export default ExerciseCounter;