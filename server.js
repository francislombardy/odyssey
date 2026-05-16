const crypto = require("node:crypto");
const path = require("node:path");

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
require("dotenv").config();

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const IS_PRODUCTION = process.env.NODE_ENV === "production" || process.env.NETLIFY === "true";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "odyssey-admin-2026");
const ADMIN_SECRET =
  process.env.ADMIN_SECRET ||
  crypto.createHash("sha256").update(`${ADMIN_PASSWORD}:odyssey-admin-secret`).digest("hex");
const COOKIE_NAME = "odyssey_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const STORAGE_BUCKETS = {
  business: "business-uploads",
  creator: "creator-uploads",
  partner: "partner-uploads",
  general: "general-enquiry-uploads"
};

const STATUS_OPTIONS = [
  "New",
  "Reviewed",
  "Approved",
  "Rejected",
  "Contacted",
  "Follow-up Needed",
  "Converted",
  "Archived"
];

const TRACKING_EVENTS = new Set([
  "cape_living_page_view",
  "get_featured_click",
  "business_submission",
  "creator_submission",
  "partner_enquiry",
  "business_website_click",
  "business_instagram_click",
  "business_whatsapp_click",
  "business_booking_click",
  "contact_enquiry"
]);

const ADMIN_TABLES = {
  contacts: {
    table: "general_enquiries",
    mediaType: "general"
  },
  business: {
    table: "business_submissions",
    mediaType: "business"
  },
  creators: {
    table: "creator_submissions",
    mediaType: "creator"
  },
  partners: {
    table: "partnership_enquiries",
    mediaType: "partner"
  }
};

const app = express();
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, _res, next) => {
  const functionBasePath = "/.netlify/functions/api";

  if (req.url === functionBasePath) {
    req.url = "/api";
  } else if (req.url.startsWith(`${functionBasePath}/`)) {
    req.url = `/api/${req.url.slice(functionBasePath.length + 1)}`;
  }

  next();
});
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Configure CORS to allow front-end hosts to submit forms directly to this API.
// Set ALLOWED_ORIGINS to a comma-separated list of allowed origins (e.g. https://yoursite.netlify.app).
// If ALLOWED_ORIGINS is not set, CORS will allow all origins.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedOrigins.length) {
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true
    })
  );
} else {
  app.use(cors({ origin: true, credentials: true }));
}

const requestClientKey = (req) => {
  const headerValue =
    req.headers["x-nf-client-connection-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown";

  return String(Array.isArray(headerValue) ? headerValue[0] : headerValue)
    .split(",")[0]
    .trim() || "unknown";
};

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  return next(err);
});

const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 18,
  keyGenerator: requestClientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions from this connection. Please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: requestClientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again shortly." }
});

const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  keyGenerator: requestClientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Tracking limit reached." }
});

const safeText = (value) => String(value || "").trim();

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(value));

const isHttpUrl = (value) => {
  const cleanValue = safeText(value);
  if (!cleanValue) return true;

  try {
    const parsed = new URL(cleanValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const requireSupabase = (res) => {
  if (supabase) return true;

  res.status(503).json({
    error: "Supabase is not configured.",
    details: ["Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment."]
  });
  return false;
};

const normalizeOptionalUrl = (value, label, errors) => {
  const cleanValue = safeText(value);
  if (!cleanValue) return "";

  if (isHttpUrl(cleanValue)) return cleanValue;

  errors.push(`${label} must be a full link starting with http:// or https://.`);
  return cleanValue;
};

const normalizeSocialLink = (value, platform, label, errors, options = {}) => {
  const cleanValue = safeText(value);
  if (!cleanValue) {
    if (options.required) errors.push(`${label} is required.`);
    return "";
  }

  if (isHttpUrl(cleanValue)) return cleanValue;

  const handle = cleanValue
    .replace(/^@+/, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^www\.instagram\.com\//i, "")
    .replace(/^tiktok\.com\/@?/i, "")
    .replace(/^www\.tiktok\.com\/@?/i, "")
    .split(/[/?#]/)[0]
    .trim();

  if (!/^[a-zA-Z0-9._-]{2,60}$/.test(handle)) {
    errors.push(`${label} can be a full link or a valid handle like @yourbusiness.`);
    return cleanValue;
  }

  return platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}`;
};

const normalizeWhatsAppLink = (value, label, errors) => {
  const cleanValue = safeText(value);
  if (!cleanValue) return "";

  if (isHttpUrl(cleanValue)) return cleanValue;

  let digits = cleanValue.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^0\d{9}$/.test(digits)) {
    digits = `27${digits.slice(1)}`;
  }

  if (!/^\d{7,15}$/.test(digits)) {
    errors.push(`${label} can be a WhatsApp link or a phone number with country code.`);
    return cleanValue;
  }

  return `https://wa.me/${digits}`;
};

const sanitizeFileBase = (fileName) =>
  path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "upload";

const makeUpload = (fields) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: 16
    },
    fileFilter(_req, file, cb) {
      const extension = path.extname(file.originalname).toLowerCase();
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      const videoExtensions = [".mp4", ".mov", ".webm"];
      const isImage = imageExtensions.includes(extension) && file.mimetype.startsWith("image/");
      const isVideo = videoExtensions.includes(extension) && file.mimetype.startsWith("video/");

      if (file.fieldname === "logo" && isImage) return cb(null, true);
      if (file.fieldname === "photos" && isImage) return cb(null, true);
      if (file.fieldname === "videos" && isVideo) return cb(null, true);
      if (file.fieldname === "contentFiles" && (isImage || isVideo)) return cb(null, true);

      return cb(new Error("Only JPG, PNG, WEBP, GIF, MP4, MOV, and WEBM uploads are allowed."));
    }
  }).fields(fields);

const businessUpload = makeUpload([
  { name: "logo", maxCount: 1 },
  { name: "photos", maxCount: 10 },
  { name: "videos", maxCount: 4 }
]);

const creatorUpload = makeUpload([{ name: "contentFiles", maxCount: 10 }]);
const contactUpload = multer().none();
const partnerUpload = multer().none();

const validateRequired = (body, fields, errors) => {
  fields.forEach(([key, label]) => {
    if (!safeText(body[key])) {
      errors.push(`${label} is required.`);
    }
  });
};

const validateConsents = (body, fields, errors) => {
  fields.forEach(([key, label]) => {
    if (body[key] !== "on" && body[key] !== "true") {
      errors.push(label);
    }
  });
};

const validateSpamSignals = (body, errors) => {
  if (safeText(body.odysseyHp)) {
    errors.push("Submission could not be accepted.");
  }

  const startedAt = Number(body.formStartedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 1500) {
    errors.push("Please take a moment to review the form before submitting.");
  }
};

const validateUrls = (body, fields, errors) => {
  fields.forEach(([key, label]) => {
    if (!isHttpUrl(body[key])) {
      errors.push(`${label} must be a valid http or https link.`);
    }
  });
};

const sendValidation = (res, errors) =>
  res.status(400).json({
    error: "Please check the following fields.",
    details: errors
  });

const signSession = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
};

const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );

const verifySession = (token) => {
  if (!token || !token.includes(".")) return false;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.role === "admin" && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
};

const requireAdmin = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifySession(cookies[COOKIE_NAME])) {
    return res.status(401).json({ error: "Admin login required." });
  }

  return next();
};

const samePassword = (candidate) => {
  const a = Buffer.from(String(candidate || ""));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const nowIso = () => new Date().toISOString();

const supabaseInsert = async (table, values, options = {}) => {
  const query = supabase.from(table).insert(values);
  const result = options.select === false ? await query : await query.select(options.select || "*").single();
  if (result.error) throw result.error;
  return result.data;
};

const supabaseUpdate = async (table, id, values) => {
  const { error } = await supabase.from(table).update(values).eq("id", id);
  if (error) throw error;
};

const createUploadPlan = async (submissionType, submissionId, files = {}) => {
  const bucket = STORAGE_BUCKETS[submissionType];
  const uploaded = [];
  const rows = [];

  if (!bucket) {
    throw new Error(`No Supabase Storage bucket is configured for ${submissionType}.`);
  }

  for (const [fieldName, fileList] of Object.entries(files || {})) {
    for (const file of fileList) {
      const extension = path.extname(file.originalname).toLowerCase();
      const safeName = sanitizeFileBase(file.originalname);
      const fileName = `${Date.now()}-${crypto.randomUUID()}-${safeName}${extension}`;
      const objectPath = `${submissionId}/${fieldName}/${fileName}`;

      const { error } = await supabase.storage.from(bucket).upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

      if (error) {
        await cleanupStorage(uploaded);
        throw error;
      }

      uploaded.push({ bucket, objectPath });
      rows.push({
        submission_type: submissionType,
        submission_id: submissionId,
        field_name: fieldName,
        original_name: file.originalname,
        file_name: fileName,
        bucket,
        object_path: objectPath,
        mime_type: file.mimetype,
        size_bytes: file.size
      });
    }
  }

  return { uploaded, rows };
};

const cleanupStorage = async (items = []) => {
  const grouped = items.reduce((acc, item) => {
    acc[item.bucket] = acc[item.bucket] || [];
    acc[item.bucket].push(item.objectPath);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(grouped).map(([bucket, objectPaths]) => supabase.storage.from(bucket).remove(objectPaths))
  );
};

const insertMediaRows = async (rows = []) => {
  if (!rows.length) return [];

  const { data, error } = await supabase.from("media_files").insert(rows).select("*");
  if (error) throw error;
  return data || [];
};

const deleteSubmission = async (table, id) => {
  await supabase.from(table).delete().eq("id", id);
};

const uploadSubmissionMedia = async ({ table, submissionType, submissionId, files }) => {
  let uploadPlan = { uploaded: [], rows: [] };

  try {
    uploadPlan = await createUploadPlan(submissionType, submissionId, files);
    return await insertMediaRows(uploadPlan.rows);
  } catch (error) {
    await cleanupStorage(uploadPlan.uploaded);
    await deleteSubmission(table, submissionId);
    throw error;
  }
};

const mediaForRows = async (submissionType, rows) => {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return rows.map((row) => ({ ...row, media: [] }));

  const { data, error } = await supabase
    .from("media_files")
    .select("*")
    .eq("submission_type", submissionType)
    .in("submission_id", ids)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const mediaBySubmission = {};
  (data || []).forEach((file) => {
    mediaBySubmission[file.submission_id] = mediaBySubmission[file.submission_id] || [];
    mediaBySubmission[file.submission_id].push({
      id: file.id,
      field: file.field_name,
      originalName: file.original_name,
      fileName: file.file_name,
      size: file.size_bytes,
      mimeType: file.mime_type,
      bucket: file.bucket,
      objectPath: file.object_path,
      url: `/api/admin/uploads/${file.id}`
    });
  });

  return rows.map((row) => ({
    ...row,
    media: mediaBySubmission[row.id] || []
  }));
};

const handleAsync = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const runMulter = (upload, req, res) =>
  new Promise((resolve, reject) => {
    upload(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

app.post("/api/admin/login", authLimiter, (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Admin password is not configured." });
  }

  if (!samePassword(req.body.password)) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }

  const token = signSession({ role: "admin", exp: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  return res.json({ authenticated: verifySession(cookies[COOKIE_NAME]) });
});

app.post(
  "/api/submissions/contact",
  submissionLimiter,
  handleAsync(async (req, res) => {
    await runMulter(contactUpload, req, res);
    if (!requireSupabase(res)) return;

    const errors = [];
    validateSpamSignals(req.body, errors);
    validateRequired(
      req.body,
      [
        ["fullName", "Full name"],
        ["email", "Email address"],
        ["phone", "Phone / WhatsApp"],
        ["businessName", "Business name"],
        ["businessType", "Business type"],
        ["service", "Service interested in"],
        ["message", "Message"]
      ],
      errors
    );

    if (!isEmail(req.body.email)) errors.push("Email address must be valid.");

    if (errors.length) {
      return sendValidation(res, errors);
    }

    const submittedAt = nowIso();
    const sourcePage = safeText(req.body.sourcePage) || safeText(req.headers.referer) || "/";
    const row = await supabaseInsert("general_enquiries", {
      submitted_at: submittedAt,
      updated_at: submittedAt,
      full_name: safeText(req.body.fullName),
      email: safeText(req.body.email),
      phone: safeText(req.body.phone),
      business_name: safeText(req.body.businessName),
      business_type: safeText(req.body.businessType),
      service_interested_in: safeText(req.body.service),
      message: safeText(req.body.message),
      source_page: sourcePage.slice(0, 300)
    });

    return res.status(201).json({
      ok: true,
      id: row.id,
      message: "Thank you. Your enquiry has been sent to Odyssey. We will review it and get back to you."
    });
  })
);

app.post(
  "/api/submissions/business",
  submissionLimiter,
  handleAsync(async (req, res) => {
    await runMulter(businessUpload, req, res);
    if (!requireSupabase(res)) return;

    const errors = [];
    validateSpamSignals(req.body, errors);
    validateRequired(
      req.body,
      [
        ["businessName", "Business name"],
        ["businessCategory", "Business category"],
        ["contactName", "Contact person name"],
        ["contactEmail", "Contact person email"],
        ["contactPhone", "Contact person phone / WhatsApp"],
        ["businessLocation", "Business location / area"],
        ["businessAddress", "Business address"],
        ["businessDescription", "Short business description"],
        ["uniqueValue", "What makes the business unique"],
        ["mainProductsServices", "Main products/services"],
        ["targetAudience", "Target audience"],
        ["complimentaryShoot", "Complimentary launch content shoot answer"]
      ],
      errors
    );
    validateConsents(
      req.body,
      [
        ["consentFeature", "Feature permission consent is required."],
        ["consentMediaRights", "Media rights confirmation is required."],
        ["consentContact", "Contact consent is required."],
        ["consentPrivacy", "Privacy Policy consent is required."]
      ],
      errors
    );

    const normalizedWebsiteLink = normalizeOptionalUrl(req.body.websiteLink, "Website link", errors);
    const normalizedInstagramLink = normalizeSocialLink(req.body.instagramLink, "instagram", "Instagram", errors, {
      required: true
    });
    const normalizedTiktokLink = normalizeSocialLink(req.body.tiktokLink, "tiktok", "TikTok", errors);
    const normalizedBookingLink = normalizeOptionalUrl(req.body.bookingLink, "Booking link", errors);
    const normalizedWhatsappLink = normalizeWhatsAppLink(req.body.whatsappLink, "WhatsApp booking/contact", errors);

    if (!isEmail(req.body.contactEmail)) errors.push("Contact email must be valid.");
    if (!["Yes", "No"].includes(safeText(req.body.complimentaryShoot))) {
      errors.push("Please choose Yes or No for the complimentary launch content shoot.");
    }

    if (errors.length) {
      return sendValidation(res, errors);
    }

    const submittedAt = nowIso();
    const row = await supabaseInsert("business_submissions", {
      submitted_at: submittedAt,
      updated_at: submittedAt,
      business_name: safeText(req.body.businessName),
      category: safeText(req.body.businessCategory),
      contact_name: safeText(req.body.contactName),
      email: safeText(req.body.contactEmail),
      phone: safeText(req.body.contactPhone),
      location: safeText(req.body.businessLocation),
      address: safeText(req.body.businessAddress),
      website_link: normalizedWebsiteLink,
      instagram_link: normalizedInstagramLink,
      tiktok_link: normalizedTiktokLink,
      booking_link: normalizedBookingLink,
      whatsapp_link: normalizedWhatsappLink,
      business_description: safeText(req.body.businessDescription),
      unique_value: safeText(req.body.uniqueValue),
      main_products_services: safeText(req.body.mainProductsServices),
      target_audience: safeText(req.body.targetAudience),
      price_range: safeText(req.body.priceRange),
      opening_hours: safeText(req.body.openingHours),
      complimentary_shoot: safeText(req.body.complimentaryShoot)
    });

    if (req.files && Object.keys(req.files).length) {
      await uploadSubmissionMedia({
        table: "business_submissions",
        submissionType: "business",
        submissionId: row.id,
        files: req.files
      });
    }

    return res.status(201).json({
      ok: true,
      id: row.id,
      message: "Thank you. Odyssey/Cape Living will review your business submission."
    });
  })
);

app.post(
  "/api/submissions/creator",
  submissionLimiter,
  handleAsync(async (req, res) => {
    await runMulter(creatorUpload, req, res);
    if (!requireSupabase(res)) return;

    const errors = [];
    validateSpamSignals(req.body, errors);
    validateRequired(
      req.body,
      [
        ["fullName", "Full name"],
        ["email", "Email"],
        ["phone", "Phone / WhatsApp"],
        ["instagramHandle", "Instagram handle"],
        ["location", "Location / area"],
        ["contentType", "Type of content created"],
        ["shortBio", "Short bio"],
        ["contentCaption", "Content caption or description"],
        ["joinCreatorProgram", "Creator Program answer"],
        ["openToPaidCollabs", "Paid collaborations answer"]
      ],
      errors
    );
    validateConsents(
      req.body,
      [
        ["consentOwnRights", "Content rights confirmation is required."],
        ["consentRepost", "Organic repost permission is required."],
        ["consentNoAds", "Paid advertising permission acknowledgement is required."],
        ["consentContact", "Contact consent is required."],
        ["consentPrivacy", "Privacy Policy consent is required."]
      ],
      errors
    );
    validateUrls(req.body, [["youtubeLink", "YouTube link"]], errors);

    if (!req.files || !req.files.contentFiles || req.files.contentFiles.length === 0) {
      errors.push("Content upload is required.");
    }
    if (!isEmail(req.body.email)) errors.push("Email must be valid.");
    if (!["Yes", "No"].includes(safeText(req.body.joinCreatorProgram))) {
      errors.push("Please choose Yes or No for joining the Creator Program.");
    }
    if (!["Yes", "No"].includes(safeText(req.body.openToPaidCollabs))) {
      errors.push("Please choose Yes or No for paid brand collaborations.");
    }

    if (errors.length) {
      return sendValidation(res, errors);
    }

    const submittedAt = nowIso();
    const row = await supabaseInsert("creator_submissions", {
      submitted_at: submittedAt,
      updated_at: submittedAt,
      full_name: safeText(req.body.fullName),
      email: safeText(req.body.email),
      phone: safeText(req.body.phone),
      instagram_handle: safeText(req.body.instagramHandle),
      tiktok_handle: safeText(req.body.tiktokHandle),
      youtube_link: safeText(req.body.youtubeLink),
      location: safeText(req.body.location),
      content_type: safeText(req.body.contentType),
      short_bio: safeText(req.body.shortBio),
      audience_size: safeText(req.body.audienceSize),
      content_caption: safeText(req.body.contentCaption),
      join_creator_program: safeText(req.body.joinCreatorProgram),
      open_to_paid_collabs: safeText(req.body.openToPaidCollabs)
    });

    await uploadSubmissionMedia({
      table: "creator_submissions",
      submissionType: "creator",
      submissionId: row.id,
      files: req.files
    });

    return res.status(201).json({
      ok: true,
      id: row.id,
      message: "Thank you. Odyssey/Cape Living will review your creator submission."
    });
  })
);

app.post(
  "/api/submissions/partner",
  submissionLimiter,
  handleAsync(async (req, res) => {
    await runMulter(partnerUpload, req, res);
    if (!requireSupabase(res)) return;

    const errors = [];
    validateSpamSignals(req.body, errors);
    validateRequired(
      req.body,
      [
        ["name", "Name"],
        ["email", "Email"],
        ["phone", "Phone / WhatsApp"],
        ["companyName", "Company / brand / venue name"],
        ["partnershipType", "Type of partnership interest"],
        ["message", "Message"]
      ],
      errors
    );
    validateConsents(
      req.body,
      [
        ["consentContact", "Contact consent is required."],
        ["consentPrivacy", "Privacy Policy consent is required."]
      ],
      errors
    );

    if (!isEmail(req.body.email)) errors.push("Email must be valid.");

    if (errors.length) {
      return sendValidation(res, errors);
    }

    const submittedAt = nowIso();
    const row = await supabaseInsert("partnership_enquiries", {
      submitted_at: submittedAt,
      updated_at: submittedAt,
      name: safeText(req.body.name),
      email: safeText(req.body.email),
      phone: safeText(req.body.phone),
      company_name: safeText(req.body.companyName),
      partnership_type: safeText(req.body.partnershipType),
      message: safeText(req.body.message)
    });

    return res.status(201).json({
      ok: true,
      id: row.id,
      message: "Thank you. Odyssey/Cape Living will review your partnership enquiry."
    });
  })
);

app.get(
  "/api/admin/submissions/:type",
  requireAdmin,
  handleAsync(async (req, res) => {
    if (!requireSupabase(res)) return;

    const config = ADMIN_TABLES[req.params.type];
    if (!config) return res.status(404).json({ error: "Unknown submission type." });

    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) throw error;

    const rows = await mediaForRows(config.mediaType, data || []);
    return res.json({
      statusOptions: STATUS_OPTIONS,
      rows
    });
  })
);

app.patch(
  "/api/admin/submissions/:type/:id",
  requireAdmin,
  handleAsync(async (req, res) => {
    if (!requireSupabase(res)) return;

    const config = ADMIN_TABLES[req.params.type];
    if (!config) return res.status(404).json({ error: "Unknown submission type." });

    const id = safeText(req.params.id);
    const status = safeText(req.body.status);
    const update = {
      updated_at: nowIso(),
      notes: safeText(req.body.notes)
    };

    if (status) {
      if (!STATUS_OPTIONS.includes(status)) {
        return res.status(400).json({ error: "Invalid status option." });
      }
      update.status = status;
    }

    if (req.params.type === "business" && req.body.profilePublicationStatus !== undefined) {
      update.profile_publication_status = safeText(req.body.profilePublicationStatus);
    }

    if (req.params.type === "creators" && req.body.creatorProgramStatus !== undefined) {
      update.creator_program_status = safeText(req.body.creatorProgramStatus);
    }

    const { data, error } = await supabase.from(config.table).update(update).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Submission not found." });
    }

    return res.json({ ok: true });
  })
);

app.post(
  "/api/tracking/events",
  trackingLimiter,
  handleAsync(async (req, res) => {
    if (!requireSupabase(res)) return;

    const eventName = safeText(req.body.event);
    if (!TRACKING_EVENTS.has(eventName)) {
      return res.status(400).json({ error: "Unknown tracking event." });
    }

    const payload =
      req.body.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload)
        ? req.body.payload
        : {};

    const { error } = await supabase.from("tracking_events").insert({
      event_name: eventName,
      event_path: safeText(req.body.path).slice(0, 300),
      payload_json: payload,
      referrer: safeText(req.headers.referer).slice(0, 300),
      user_agent: safeText(req.headers["user-agent"]).slice(0, 300),
      created_at: nowIso()
    });
    if (error) throw error;

    return res.status(204).end();
  })
);

const serveAdminUpload = handleAsync(async (req, res) => {
  if (!requireSupabase(res)) return;

  const { data: file, error } = await supabase
    .from("media_files")
    .select("*")
    .eq("id", safeText(req.params.id))
    .single();
  if (error || !file) {
    return res.status(404).json({ error: "Upload not found." });
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.object_path, 5 * 60);
  if (signedUrlError) throw signedUrlError;

  return res.redirect(data.signedUrl);
});

app.get("/admin/uploads/:id", requireAdmin, serveAdminUpload);
app.get("/api/admin/uploads/:id", requireAdmin, serveAdminUpload);

const sendHtml = (res, filePath) => res.sendFile(path.join(ROOT_DIR, filePath));

app.use("/images", express.static(path.join(ROOT_DIR, "images"), { immutable: true, maxAge: "7d" }));
app.get("/styles.css", (_req, res) => sendHtml(res, "styles.css"));
app.get("/script.js", (_req, res) => sendHtml(res, "script.js"));
app.get("/", (_req, res) => sendHtml(res, "index.html"));
app.get("/index.html", (_req, res) => sendHtml(res, "index.html"));
app.use("/cape-living", express.static(path.join(ROOT_DIR, "cape-living"), { extensions: ["html"] }));
app.use("/privacy-policy", express.static(path.join(ROOT_DIR, "privacy-policy"), { extensions: ["html"] }));
app.use("/admin", express.static(path.join(ROOT_DIR, "admin"), { extensions: ["html"] }));

app.use((err, _req, res, _next) => {
  console.error(err.message || err);
  if (err instanceof multer.MulterError || /^Only JPG/i.test(err.message || "")) {
    return res.status(400).json({
      error: err.message,
      details: [err.message]
    });
  }
  return res.status(500).json({
    error: "Server error.",
    details: ["The request could not be completed. Please try again or contact Odyssey."]
  });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(ROOT_DIR, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    if (!ADMIN_PASSWORD) {
      console.warn("ADMIN_PASSWORD is not set. Admin login is disabled.");
    } else if (!process.env.ADMIN_PASSWORD) {
      console.warn("Using default ADMIN_PASSWORD. Set ADMIN_PASSWORD before production deployment.");
    }
    if (!process.env.ADMIN_SECRET) {
      console.warn("Using derived ADMIN_SECRET. Set ADMIN_SECRET before production deployment.");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for submissions.");
    }
    if (!SUPABASE_PUBLIC_KEY) {
      console.warn("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is not set. The server does not expose it, but keep it available for deployment parity.");
    }
    console.log(`Odyssey website running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app };
