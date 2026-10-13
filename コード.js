function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ブラストエンジン 配信未完了リスト抽出')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * フロントエンドから送信されたCSVテキストを受け取って照合する
 */
function processData(blastCsvText, targetCsvText) {
  try {
    const blastRows = parseCSV(blastCsvText);
    const targetRows = parseCSV(targetCsvText);

    if (blastRows.length < 2 || targetRows.length < 2) {
      throw new Error('CSVデータ件数が足りません。ヘッダー行とデータ行が含まれているか確認してください。');
    }

    // ① ブラストエンジンログのヘッダー解析
    const blastHeader = blastRows[0];
    const blastEmailIdx = blastHeader.findIndex(h => ['メールアドレス', 'email', 'mail', 'to', '宛先'].some(k => h.toLowerCase().includes(k)));
    const blastStatusIdx = blastHeader.findIndex(h => ['ステータス', 'status', '配信結果', '結果'].some(k => h.toLowerCase().includes(k)));

    if (blastEmailIdx === -1 || blastStatusIdx === -1) {
      throw new Error(`①ブラストエンジンログの列名が見つかりませんでした。\n取得された項目: [${blastHeader.join(', ')}]`);
    }

    // メールアドレスごとの最新ステータスを保持
    const blastStatusMap = {};
    for (let i = 1; i < blastRows.length; i++) {
      const row = blastRows[i];
      const email = row[blastEmailIdx] ? row[blastEmailIdx].toLowerCase() : '';
      const status = row[blastStatusIdx] ? row[blastStatusIdx] : '';

      if (email) {
        if (!blastStatusMap[email] || blastStatusMap[email] !== '配信成功') {
          blastStatusMap[email] = status;
        }
      }
    }

    // ② 送信先リストのヘッダー解析
    const targetHeader = targetRows[0];
    const codeIdx = targetHeader.findIndex(h => h.includes('事業所コード') || h.includes('コード'));
    const nameIdx = targetHeader.findIndex(h => h.includes('送信先名') || h.includes('名称') || h.includes('名前'));
    const targetEmailIdx = targetHeader.findIndex(h => ['メールアドレス', 'email', 'mail'].some(k => h.toLowerCase().includes(k)));

    if (codeIdx === -1 || nameIdx === -1 || targetEmailIdx === -1) {
      throw new Error(`②送信先リストの列名が見つかりませんでした。\n取得された項目: [${targetHeader.join(', ')}]`);
    }

    const filteredResults = [];
    const totalTargets = targetRows.length - 1;

    for (let i = 1; i < targetRows.length; i++) {
      const row = targetRows[i];
      const code = row[codeIdx] || '';
      const name = row[nameIdx] || '';
      const rawEmail = row[targetEmailIdx] || '';
      const email = rawEmail.toLowerCase();

      if (!email) continue;

      let isTarget = false;
      let reason = '';

      if (!(email in blastStatusMap)) {
        isTarget = true;
        reason = '未到達（ログなし）';
      } else {
        const status = blastStatusMap[email];
        if (status !== '配信成功' && status !== 'success' && status !== 'OK') {
          isTarget = true;
          reason = `ステータス不一致（${status || '不明'}）`;
        }
      }

      if (isTarget) {
        filteredResults.push({
          code: code,
          name: name,
          email: rawEmail,
          reason: reason
        });
      }
    }

    const successCount = totalTargets - filteredResults.length;

    return {
      success: true,
      totalTargets: totalTargets,
      successCount: successCount,
      results: filteredResults
    };

  } catch (err) {
    return {
      success: false,
      message: err.message
    };
  }
}

// 簡易CSVパース関数
function parseCSV(text) {
  const lines = text.split(/\r\n|\n/);
  const result = [];
  
  for (let line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let insideQuote = false;
    let entry = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim().replace(/^"|"$/g, ''));
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim().replace(/^"|"$/g, ''));
    result.push(row);
  }
  return result;
}