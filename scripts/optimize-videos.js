#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const SCRIPT_VERSION = 1;

const args = process.argv.slice(2);

const getArgValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const hasFlag = (name) => args.includes(name);

const config = {
  sourceDir: path.resolve(ROOT_DIR, getArgValue("--source", process.env.VIDEO_SOURCE_DIR || "images/videos")),
  optimizedDir: path.resolve(ROOT_DIR, getArgValue("--out", process.env.VIDEO_OPTIMIZED_DIR || "images/optimized-videos")),
  posterDir: path.resolve(ROOT_DIR, getArgValue("--posters", process.env.VIDEO_POSTER_DIR || "images/video-posters")),
  manifestPath: path.resolve(ROOT_DIR, getArgValue("--manifest", process.env.VIDEO_MANIFEST_PATH || "images/video-manifest.json")),
  widths: (getArgValue("--widths", process.env.VIDEO_WIDTHS || "1080,720"))
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a),
  crf: String(getArgValue("--crf", process.env.VIDEO_CRF || "25")),
  webmCrf: String(getArgValue("--webm-crf", process.env.VIDEO_WEBM_CRF || "34")),
  preset: String(getArgValue("--preset", process.env.VIDEO_PRESET || "medium")),
  posterWidth: Number(getArgValue("--poster-width", process.env.VIDEO_POSTER_WIDTH || "1080")),
  includeWebm: hasFlag("--webm") || process.env.VIDEO_WEBM === "1",
  keepAudio: hasFlag("--keep-audio") || process.env.VIDEO_KEEP_AUDIO === "1",
  force: hasFlag("--force") || process.env.VIDEO_FORCE === "1",
  requireFfmpeg: hasFlag("--require-ffmpeg") || process.env.VIDEO_REQUIRE_FFMPEG === "1",
  sourceWarnBytes: Number(getArgValue("--source-warn-mb", process.env.VIDEO_SOURCE_WARN_MB || "15")) * 1024 * 1024,
  outputWarnBytes: Number(getArgValue("--output-warn-mb", process.env.VIDEO_OUTPUT_WARN_MB || "8")) * 1024 * 1024
};

if (!config.widths.length) {
  config.widths = [1080, 720];
}

const toPosix = (value) => value.split(path.sep).join("/");

const relativeAsset = (filePath) => toPosix(path.relative(ROOT_DIR, filePath));

const bytesToMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const slugify = (value) =>
  path
    .basename(value, path.extname(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "video";

const optionalRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
};

const findOnPath = (command) => {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, [command], { encoding: "utf8" });
  if (result.status !== 0) return null;

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || null;
};

const resolveFfmpeg = () => {
  const ffmpegStatic = optionalRequire("ffmpeg-static");
  const ffprobeStatic = optionalRequire("ffprobe-static");

  return {
    ffmpeg:
      process.env.FFMPEG_PATH ||
      (typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null) ||
      findOnPath("ffmpeg"),
    ffprobe:
      process.env.FFPROBE_PATH ||
      (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path) ? ffprobeStatic.path : null) ||
      findOnPath("ffprobe")
  };
};

const run = (command, commandArgs, label) => {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed.${output ? `\n${output}` : ""}`);
  }

  return result.stdout;
};

const findVideoFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findVideoFiles(fullPath);
      if (!entry.isFile()) return [];
      return VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
    })
    .sort((a, b) => a.localeCompare(b));
};

const probeVideo = (ffprobe, filePath) => {
  if (!ffprobe) return {};

  try {
    const output = run(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=index,codec_type,codec_name,width,height:format=duration,size,bit_rate",
        "-of",
        "json",
        filePath
      ],
      `ffprobe ${path.basename(filePath)}`
    );
    const data = JSON.parse(output);
    const videoStream = (data.streams || []).find((stream) => stream.codec_type === "video") || {};
    const audioStream = (data.streams || []).find((stream) => stream.codec_type === "audio") || {};

    return {
      width: Number(videoStream.width) || null,
      height: Number(videoStream.height) || null,
      duration: data.format && data.format.duration ? Number(data.format.duration) : null,
      bitRate: data.format && data.format.bit_rate ? Number(data.format.bit_rate) : null,
      videoCodec: videoStream.codec_name || null,
      hasAudio: Boolean(audioStream.codec_name)
    };
  } catch (error) {
    console.warn(`Could not inspect ${path.basename(filePath)}: ${error.message}`);
    return {};
  }
};

const readManifest = () => {
  if (!fs.existsSync(config.manifestPath)) {
    return { videos: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(config.manifestPath, "utf8"));
  } catch {
    return { videos: {} };
  }
};

const settingsHash = () =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: SCRIPT_VERSION,
        widths: config.widths,
        crf: config.crf,
        webmCrf: config.webmCrf,
        preset: config.preset,
        posterWidth: config.posterWidth,
        includeWebm: config.includeWebm,
        keepAudio: config.keepAudio
      })
    )
    .digest("hex");

const expectedOutputs = (sourcePath, metadata) => {
  const relativeSource = path.relative(config.sourceDir, sourcePath);
  const hash = crypto.createHash("sha1").update(relativeSource).digest("hex").slice(0, 8);
  const baseName = `${slugify(sourcePath)}-${hash}`;
  const sourceWidth = Number(metadata.width) || null;
  const plannedWidths = [];

  config.widths.forEach((width) => {
    const outputWidth = sourceWidth ? Math.min(width, sourceWidth) : width;
    if (!plannedWidths.includes(outputWidth)) {
      plannedWidths.push(outputWidth);
    }
  });

  return {
    posterPath: path.join(config.posterDir, `${baseName}.jpg`),
    videoOutputs: plannedWidths.flatMap((width) => {
      const outputBase = `${baseName}-${width}`;
      const outputs = [
        {
          key: `mp4_${width}`,
          format: "mp4",
          width,
          path: path.join(config.optimizedDir, `${outputBase}.mp4`)
        }
      ];

      if (config.includeWebm) {
        outputs.push({
          key: `webm_${width}`,
          format: "webm",
          width,
          path: path.join(config.optimizedDir, `${outputBase}.webm`)
        });
      }

      return outputs;
    })
  };
};

const outputsExist = (entry) => {
  if (!entry || !entry.poster || !entry.outputs) return false;
  const posterExists = fs.existsSync(path.resolve(ROOT_DIR, entry.poster.src || ""));
  const videosExist = Object.values(entry.outputs).every((output) => output && output.src && fs.existsSync(path.resolve(ROOT_DIR, output.src)));
  return posterExists && videosExist;
};

const encodeMp4 = (ffmpeg, inputPath, outputPath, width) => {
  const tempPath = outputPath.replace(/\.mp4$/i, ".tmp.mp4");
  fs.rmSync(tempPath, { force: true });

  const commandArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-vf",
    `scale='min(${width},iw)':-2`,
    "-c:v",
    "libx264",
    "-preset",
    config.preset,
    "-crf",
    config.crf,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart"
  ];

  if (config.keepAudio) {
    commandArgs.push("-map", "0:a?", "-c:a", "aac", "-b:a", "96k", "-ac", "2");
  } else {
    commandArgs.push("-an");
  }

  commandArgs.push(tempPath);
  run(ffmpeg, commandArgs, `MP4 optimization for ${path.basename(inputPath)}`);
  fs.renameSync(tempPath, outputPath);
};

const encodeWebm = (ffmpeg, inputPath, outputPath, width) => {
  const tempPath = outputPath.replace(/\.webm$/i, ".tmp.webm");
  fs.rmSync(tempPath, { force: true });

  run(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-vf",
      `scale='min(${width},iw)':-2`,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      config.webmCrf,
      "-row-mt",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-an",
      tempPath
    ],
    `WebM optimization for ${path.basename(inputPath)}`
  );
  fs.renameSync(tempPath, outputPath);
};

const generatePoster = (ffmpeg, inputPath, outputPath) => {
  const tempPath = `${outputPath}.tmp.jpg`;
  fs.rmSync(tempPath, { force: true });

  const baseArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "1",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    `scale='min(${config.posterWidth},iw)':-2`,
    "-q:v",
    "4",
    tempPath
  ];

  try {
    run(ffmpeg, baseArgs, `poster generation for ${path.basename(inputPath)}`);
  } catch {
    run(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        `scale='min(${config.posterWidth},iw)':-2`,
        "-q:v",
        "4",
        tempPath
      ],
      `fallback poster generation for ${path.basename(inputPath)}`
    );
  }

  fs.renameSync(tempPath, outputPath);
};

const manifestEntryFor = (sourcePath, stat, metadata, outputPlan, hashValue) => {
  const outputs = {};
  outputPlan.videoOutputs.forEach((output) => {
    if (!fs.existsSync(output.path)) return;
    const outputStat = fs.statSync(output.path);
    outputs[output.key] = {
      src: relativeAsset(output.path),
      format: output.format,
      width: output.width,
      size: outputStat.size,
      sizeMb: Number((outputStat.size / 1024 / 1024).toFixed(2)),
      tooLarge: outputStat.size > config.outputWarnBytes
    };
  });

  const posterStat = fs.existsSync(outputPlan.posterPath) ? fs.statSync(outputPlan.posterPath) : null;

  return {
    source: relativeAsset(sourcePath),
    sourceSize: stat.size,
    sourceSizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
    sourceMtimeMs: Math.round(stat.mtimeMs),
    sourceTooLarge: stat.size > config.sourceWarnBytes,
    settingsHash: hashValue,
    metadata,
    poster: posterStat
      ? {
          src: relativeAsset(outputPlan.posterPath),
          size: posterStat.size,
          sizeMb: Number((posterStat.size / 1024 / 1024).toFixed(2))
        }
      : null,
    outputs
  };
};

const main = () => {
  const binaries = resolveFfmpeg();
  const sourceFiles = findVideoFiles(config.sourceDir);
  const previousManifest = readManifest();
  const hashValue = settingsHash();

  fs.mkdirSync(config.optimizedDir, { recursive: true });
  fs.mkdirSync(config.posterDir, { recursive: true });
  fs.mkdirSync(path.dirname(config.manifestPath), { recursive: true });

  if (!sourceFiles.length) {
    console.log(`No source videos found in ${relativeAsset(config.sourceDir)}.`);
    fs.writeFileSync(
      config.manifestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sourceDirectory: relativeAsset(config.sourceDir),
          optimizedDirectory: relativeAsset(config.optimizedDir),
          posterDirectory: relativeAsset(config.posterDir),
          videos: {}
        },
        null,
        2
      )
    );
    return;
  }

  if (!binaries.ffmpeg) {
    const message =
      "FFmpeg was not found. Install FFmpeg or run npm install so ffmpeg-static is available, then run npm run optimize:videos.";
    if (config.requireFfmpeg) {
      throw new Error(message);
    }
    console.warn(message);
    console.warn("Skipping optimization without failing the process.");
    return;
  }

  console.log(`Optimizing ${sourceFiles.length} video(s) from ${relativeAsset(config.sourceDir)}.`);
  console.log(`MP4: H.264 CRF ${config.crf}, preset ${config.preset}, widths ${config.widths.join(", ")}.`);
  console.log(`Audio: ${config.keepAudio ? "AAC 96k" : "removed for muted portfolio previews"}.`);
  console.log(`WebM: ${config.includeWebm ? `enabled, VP9 CRF ${config.webmCrf}` : "disabled by default"}.`);

  const videos = {};
  let optimizedCount = 0;
  let skippedCount = 0;

  sourceFiles.forEach((sourcePath) => {
    const relativeSource = relativeAsset(sourcePath);
    const stat = fs.statSync(sourcePath);
    const metadata = probeVideo(binaries.ffprobe, sourcePath);
    const outputPlan = expectedOutputs(sourcePath, metadata);
    const previousEntry = previousManifest.videos && previousManifest.videos[relativeSource];
    const unchanged =
      !config.force &&
      previousEntry &&
      previousEntry.sourceSize === stat.size &&
      previousEntry.sourceMtimeMs === Math.round(stat.mtimeMs) &&
      previousEntry.settingsHash === hashValue &&
      outputsExist(previousEntry);

    if (stat.size > config.sourceWarnBytes) {
      console.warn(`Large source video: ${relativeSource} (${bytesToMb(stat.size)}).`);
    }

    if (unchanged) {
      videos[relativeSource] = previousEntry;
      skippedCount += 1;
      console.log(`Skipping unchanged video: ${relativeSource}`);
      return;
    }

    console.log(`Processing ${relativeSource}`);

    if (!fs.existsSync(outputPlan.posterPath) || config.force) {
      generatePoster(binaries.ffmpeg, sourcePath, outputPlan.posterPath);
    }

    outputPlan.videoOutputs.forEach((output) => {
      if (fs.existsSync(output.path) && !config.force) return;

      if (output.format === "webm") {
        encodeWebm(binaries.ffmpeg, sourcePath, output.path, output.width);
      } else {
        encodeMp4(binaries.ffmpeg, sourcePath, output.path, output.width);
      }

      const outputSize = fs.statSync(output.path).size;
      if (outputSize > config.outputWarnBytes) {
        console.warn(`Optimized file is still large: ${relativeAsset(output.path)} (${bytesToMb(outputSize)}).`);
      }
    });

    videos[relativeSource] = manifestEntryFor(sourcePath, stat, metadata, outputPlan, hashValue);
    optimizedCount += 1;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    scriptVersion: SCRIPT_VERSION,
    sourceDirectory: relativeAsset(config.sourceDir),
    optimizedDirectory: relativeAsset(config.optimizedDir),
    posterDirectory: relativeAsset(config.posterDir),
    settings: {
      widths: config.widths,
      mp4: {
        codec: "h264",
        crf: Number(config.crf),
        preset: config.preset,
        audio: config.keepAudio ? "aac 96k" : "removed",
        fastStart: true
      },
      webm: config.includeWebm
        ? {
            codec: "vp9",
            crf: Number(config.webmCrf)
          }
        : null,
      poster: {
        format: "jpg",
        width: config.posterWidth
      }
    },
    videos
  };

  fs.writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${relativeAsset(config.manifestPath)}.`);
  console.log(`Done. ${optimizedCount} processed, ${skippedCount} skipped.`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
