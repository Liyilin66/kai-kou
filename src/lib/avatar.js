export function normalizeAvatarUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

let lastTimestamp = 0;
export function createAvatarPath(userId, now = Date.now()) {
  if (!/^[a-z0-9-]+$/i.test(userId || "")) {
    throw new Error("请先登录后再上传头像");
  }
  lastTimestamp = Math.max(now, lastTimestamp + 1);
  return `${userId}/avatar-${lastTimestamp}.jpg`;
}

export async function uploadAndSaveAvatar({ client, userId, blob, saveMetadata, warn = console.warn }) {
  if (!(blob instanceof Blob) || blob.type !== "image/jpeg" || !blob.size || blob.size > 1024 * 1024) {
    throw new Error("头像数据无效，请重新选择图片（压缩后不超过 1MB）");
  }
  const path = createAvatarPath(userId);
  const bucket = client.storage.from("avatars");
  // Snapshot existing files before upload so a later concurrent upload is never deleted.
  let oldFiles = [];
  try {
    const listed = await bucket.list(userId, { limit: 1000 });
    if (listed.error) throw listed.error;
    oldFiles = (listed.data || [])
      .filter((file) => /^avatar-\d+\.jpg$/.test(file.name))
      .map((file) => `${userId}/${file.name}`);
  } catch {
    warn("旧头像列表读取失败，保留旧文件");
  }

  let uploaded;
  try {
    uploaded = await bucket.upload(path, blob, { contentType: "image/jpeg", upsert: false });
  } catch {
    throw new Error("头像上传失败，请稍后重试");
  }
  if (uploaded.error) throw new Error("头像上传失败，请稍后重试");

  const url = normalizeAvatarUrl(bucket.getPublicUrl(path)?.data?.publicUrl);
  try {
    if (!url || url.length >= 300) throw new Error("头像链接无效，请稍后重试");
    await saveMetadata({ avatar_url: url });
  } catch (error) {
    try {
      const removed = await bucket.remove([path]);
      if (removed.error) throw removed.error;
    } catch {
      warn("未保存的头像清理失败");
    }
    throw error;
  }

  if (oldFiles.length) {
    try {
      const removed = await bucket.remove(oldFiles);
      if (removed.error) throw removed.error;
    } catch {
      warn("旧头像删除失败，已保存的新头像不受影响");
    }
  }
  return url;
}
