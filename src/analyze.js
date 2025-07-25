// COMPLETE ENHANCED writeToSheets METHOD - REPLACE THE EXISTING ONE IN YOUR analyze.js FILE

async writeToSheets(analysis) {
  console.log('📝 Creating beautiful dashboard in Google Sheets...');
  
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.log('⚠️ No Google Sheet ID provided, skipping sheet update');
    return;
  }

  try {
    // Clear existing content
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'A1:Z1000'
    });

    // Color scheme - modern dashboard colors
    const colors = {
      primary: { red: 0.2, green: 0.4, blue: 0.8 },      // Blue
      secondary: { red: 0.1, green: 0.7, blue: 0.3 },    // Green
      accent: { red: 0.9, green: 0.5, blue: 0.1 },       // Orange
      danger: { red: 0.9, green: 0.2, blue: 0.2 },       // Red
      warning: { red: 1, green: 0.8, blue: 0.2 },        // Yellow
      light: { red: 0.95, green: 0.95, blue: 0.95 },     // Light gray
      dark: { red: 0.2, green: 0.2, blue: 0.2 },         // Dark gray
      white: { red: 1, green: 1, blue: 1 },              // White
      excellent: { red: 0.2, green: 0.7, blue: 0.3 },    // Green for excellent scores
      good: { red: 0.3, green: 0.6, blue: 0.9 },         // Blue for good scores
      fair: { red: 1, green: 0.7, blue: 0.2 },           // Orange for fair scores
      poor: { red: 0.9, green: 0.3, blue: 0.3 }          // Red for poor scores
    };

    // Create the dashboard content
    const dashboardData = this.createDashboardData(analysis);
    
    // Write the data first
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: { values: dashboardData.values }
    });

    // Apply all formatting
    await this.applyDashboardFormatting(sheetId, analysis, colors);

    console.log('✅ Beautiful dashboard created in Google Sheets!');
  } catch (error) {
    console.error('❌ Failed to create dashboard:', error.message);
  }
}

// ADD THESE HELPER METHODS TO YOUR YouTubeChannelAnalyzer CLASS:

createDashboardData(analysis) {
  const values = [
    // Header Section
    ['📊 YOUTUBE CHANNEL DASHBOARD', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    [analysis.channel.name, '', '', '', `Generated: ${new Date().toLocaleDateString()}`, '', '', ''],
    ['', '', '', '', '', '', '', ''],
    
    // Key Metrics Row
    ['📈 KEY METRICS', '', '👥 SUBSCRIBERS', analysis.channel.subscriberCount.toLocaleString(), '👁️ TOTAL VIEWS', analysis.channel.totalViews.toLocaleString(), '🎥 VIDEOS', analysis.channel.videoCount],
    ['', '', '', '', '', '', '', ''],
    
    // Performance Scores Section
    ['🏆 PERFORMANCE SCORES', '', '', '', '📊 DETAILED BREAKDOWN', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    
    // Score cards in a grid layout
    ['🎨 Branding', this.getScoreValue(analysis.overallScores.brandingScore), this.getScoreGrade(analysis.overallScores.brandingScore), '', '🔍 SEO & Metadata', this.getScoreValue(analysis.overallScores.seoScore), this.getScoreGrade(analysis.overallScores.seoScore), ''],
    ['📅 Content Strategy', this.getScoreValue(analysis.overallScores.contentStrategyScore), this.getScoreGrade(analysis.overallScores.contentStrategyScore), '', '💬 Engagement', this.getScoreValue(analysis.overallScores.engagementScore), this.getScoreGrade(analysis.overallScores.engagementScore), ''],
    ['🎬 Content Quality', this.getScoreValue(analysis.overallScores.contentQualityScore), this.getScoreGrade(analysis.overallScores.contentQualityScore), '', '📚 Playlists', this.getScoreValue(analysis.overallScores.playlistScore), this.getScoreGrade(analysis.overallScores.playlistScore), ''],
    ['📝 Transcripts', this.getScoreValue(analysis.overallScores.transcriptScore || 0), analysis.overallScores.transcriptScore ? this.getScoreGrade(analysis.overallScores.transcriptScore) : 'No Data', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    
    // Critical Issues Section
    ['🚨 CRITICAL ISSUES', '', '', '', '✅ QUICK WINS', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ...this.formatCriticalIssues(analysis),
    ['', '', '', '', '', '', '', ''],
    
    // SEO Analysis Section
    ['🔍 SEO DEEP DIVE', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['📝 Titles', `Avg: ${analysis.seoMetadata.titles.averageLength?.toFixed(0) || 0} chars`, `Optimal: ${analysis.seoMetadata.titles.optimalLengthPercentage?.toFixed(0) || 0}%`, '', '🏷️ Tags', `Avg: ${analysis.seoMetadata.tags.averageTagCount?.toFixed(1) || 0}`, `No Tags: ${analysis.seoMetadata.tags.videosWithNoTagsCount || 0}`, ''],
    ['📄 Descriptions', `Avg: ${analysis.seoMetadata.descriptions.averageLength?.toFixed(0) || 0} chars`, `With Timestamps: ${analysis.seoMetadata.descriptions.hasTimestampsPercentage?.toFixed(0) || 0}%`, '', '📊 Overall SEO', `${analysis.seoMetadata.overallScore.toFixed(0)}/100`, analysis.seoMetadata.scoreExplanation?.grade || '', ''],
    ['', '', '', '', '', '', '', ''],
    
    // Engagement Analysis
    ['💬 ENGAGEMENT ANALYSIS', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['📊 Views to Subs', `${analysis.engagementSignals.viewsToSubscribers?.ratio?.toFixed(1) || 0}%`, analysis.engagementSignals.viewsToSubscribers?.benchmark || '', '', '👍 Like Rate', `${analysis.engagementSignals.likeEngagement?.averageRatio?.toFixed(2) || 0}%`, analysis.engagementSignals.likeEngagement?.benchmark || '', ''],
    ['💭 Comments', `${analysis.engagementSignals.commentEngagement?.qualityScore?.toFixed(0) || 0}/100`, analysis.engagementSignals.commentEngagement?.benchmark || '', '', '🎯 Consistency', `${analysis.engagementSignals.consistency?.toFixed(0) || 0}%`, '', ''],
    ['', '', '', '', '', '', '', ''],
    
    // Transcript Analysis (if available)
    ...(analysis.transcriptAnalysis?.transcriptsAvailable > 0 ? [
      ['📝 TRANSCRIPT ANALYSIS', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['🎤 Speech Pace', `${Math.round(analysis.transcriptAnalysis.speechPatterns?.avgWordsPerMinute || 0)} WPM`, 'Target: 130-170', '', '🎯 Hook Score', `${analysis.transcriptAnalysis.avgHookScore?.toFixed(0) || 0}/100`, '', ''],
      ['💬 Filler Words', `${analysis.transcriptAnalysis.speechPatterns?.avgFillerRate?.toFixed(1) || 0}%`, 'Target: <2%', '', '📹 Coverage', `${analysis.transcriptAnalysis.transcriptsAvailable}/${analysis.videos.length} videos`, `${analysis.transcriptAnalysis.coveragePercentage || 0}%`, ''],
      ['', '', '', '', '', '', '', '']
    ] : [
      ['📝 TRANSCRIPT ANALYSIS', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['❌ No Transcripts Available', '', 'Enable auto-captions in YouTube Studio', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '']
    ]),
    
    // Content Themes
    ['🏷️ CONTENT THEMES', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ...this.formatContentThemes(analysis.contentStrategy.contentThemes),
    ['', '', '', '', '', '', '', ''],
    
    // Top Priority Actions
    ['🎯 TOP PRIORITY ACTIONS', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Priority', 'Action', 'Impact', 'Time Required', '', '', '', ''],
    ...analysis.priorityRecommendations.slice(0, 6).map(rec => [
      rec.priority || 'Medium',
      rec.action,
      rec.impact || 'Medium',
      rec.timeInvestment || '30 min',
      '', '', '', ''
    ]),
    ['', '', '', '', '', '', '', ''],
    
    // Recent Videos Performance
    ['📹 RECENT VIDEOS PERFORMANCE', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Title', 'Views', 'Tags', 'SEO Score', 'Transcript', 'Issues', '', ''],
    ...analysis.videos.slice(0, 10).map(video => [
      video.title.length > 30 ? video.title.substring(0, 27) + '...' : video.title,
      video.views.toLocaleString(),
      video.tags?.length || 0,
      video.titleAnalysis?.score?.toFixed(0) || 'N/A',
      video.transcriptAnalysis?.available ? '✅' : '❌',
      this.getTopIssue(video),
      '', ''
    ])
  ];

  return { values };
}

getScoreValue(score) {
  return score ? `${score.toFixed(0)}/100` : 'N/A';
}

getTopIssue(video) {
  if (!video.tags || video.tags.length === 0) return 'NO TAGS';
  if (video.title.length < 30) return 'SHORT TITLE';
  if (!video.description || video.description.length < 100) return 'POOR DESC';
  if (!video.transcriptAnalysis?.available) return 'NO TRANSCRIPT';
  return '✅ Good';
}

formatCriticalIssues(analysis) {
  const issues = [];
  
  if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
    issues.push([
      '🏷️ Missing Tags',
      `${analysis.seoMetadata.tags.videosWithNoTagsCount} videos`,
      'Add 8-15 relevant tags',
      'High Impact',
      '⚡ Quick Fix',
      'Add tags to all videos',
      '2-3 hours',
      ''
    ]);
  }
  
  if (analysis.seoMetadata.titles.optimalLengthPercentage < 50) {
    issues.push([
      '📝 Short Titles',
      `${Math.round((1 - analysis.seoMetadata.titles.optimalLengthPercentage/100) * analysis.videos.length)} videos`,
      'Extend to 40-60 chars',
      'Medium Impact',
      '💡 Optimization',
      'Optimize title length',
      '1-2 hours',
      ''
    ]);
  }
  
  if (analysis.engagementSignals.viewsToSubscribers?.ratio < 8) {
    issues.push([
      '👥 Low Subscriber Views',
      `${analysis.engagementSignals.viewsToSubscribers?.ratio?.toFixed(1)}% ratio`,
      'Improve hooks & thumbnails',
      'High Impact',
      '🎯 Strategy',
      'Boost subscriber engagement',
      '30 min per video',
      ''
    ]);
  }
  
  // Add empty rows if we have fewer than 3 issues
  while (issues.length < 3) {
    issues.push(['', '', '', '', '', '', '', '']);
  }
  
  return issues;
}

formatContentThemes(contentThemes) {
  if (!contentThemes.primaryThemes || contentThemes.primaryThemes.length === 0) {
    return [
      ['❌ No Clear Themes Identified', '', '', '', '💡 Recommendation', '', '', ''],
      ['Focus on 3-5 core topics', '', '', '', 'Use consistent keywords', '', '', '']
    ];
  }
  
  const themes = contentThemes.primaryThemes.slice(0, 5).map(theme => [
    `🎯 ${theme.theme.charAt(0).toUpperCase() + theme.theme.slice(1)}`,
    `Strength: ${theme.frequency}`,
    `Videos: ${theme.videos_mentioned || Math.round((theme.frequency / 20) * 100)}%`,
    '',
    '', '', '', ''
  ]);
  
  themes.push([`📊 Focus: ${contentThemes.focusRecommendation}`, '', '', '', '', '', '', '']);
  
  return themes;
}

async applyDashboardFormatting(sheetId, analysis, colors) {
  const requests = [];
  
  // 1. Header formatting
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.primary,
          textFormat: { foregroundColor: colors.white, fontSize: 18, bold: true },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
    }
  });

  // 2. Merge header cells
  requests.push({
    mergeCells: {
      range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
      mergeType: 'MERGE_ALL'
    }
  });

  // 3. Channel name styling
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.light,
          textFormat: { fontSize: 14, bold: true },
          horizontalAlignment: 'LEFT'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // 4. Key metrics section
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.secondary,
          textFormat: { foregroundColor: colors.white, fontSize: 12, bold: true },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // 5. Performance scores headers
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.accent,
          textFormat: { foregroundColor: colors.white, fontSize: 12, bold: true },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // 6. Score formatting with conditional colors
  const scoreRows = [
    { row: 8, score: analysis.overallScores.brandingScore },
    { row: 9, score: analysis.overallScores.contentStrategyScore },
    { row: 10, score: analysis.overallScores.contentQualityScore },
    { row: 11, score: analysis.overallScores.transcriptScore || 0 }
  ];

  scoreRows.forEach(({ row, score }) => {
    const scoreColor = this.getScoreColor(score, colors);
    requests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 1, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: scoreColor,
            textFormat: { foregroundColor: colors.white, bold: true },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  });

  // 7. SEO scores
  const seoScoreRows = [
    { row: 8, score: analysis.overallScores.seoScore },
    { row: 9, score: analysis.overallScores.engagementScore },
    { row: 10, score: analysis.overallScores.playlistScore }
  ];

  seoScoreRows.forEach(({ row, score }) => {
    const scoreColor = this.getScoreColor(score, colors);
    requests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 5, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            backgroundColor: scoreColor,
            textFormat: { foregroundColor: colors.white, bold: true },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  });

  // 8. Section headers styling
  const sectionHeaderRows = [13, 19, 24, 29, 34, 39, 47];
  
  sectionHeaderRows.forEach((startRow) => {
    requests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: colors.dark,
            textFormat: { foregroundColor: colors.white, fontSize: 12, bold: true },
            horizontalAlignment: 'LEFT'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    });
  });

  // 9. Critical issues formatting
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 15, endRowIndex: 18, startColumnIndex: 0, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.light,
          borders: {
            top: { style: 'SOLID', width: 1, color: colors.dark },
            bottom: { style: 'SOLID', width: 1, color: colors.dark },
            left: { style: 'SOLID', width: 1, color: colors.dark },
            right: { style: 'SOLID', width: 1, color: colors.dark }
          }
        }
      },
      fields: 'userEnteredFormat(backgroundColor,borders)'
    }
  });

  // 10. Alternating row colors for tables
  for (let i = 49; i < 59; i += 2) {
    requests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: colors.light
          }
        },
        fields: 'userEnteredFormat(backgroundColor)'
      }
    });
  }

  // 11. Auto-resize columns
  for (let i = 0; i < 8; i++) {
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: 0,
          dimension: 'COLUMNS',
          startIndex: i,
          endIndex: i + 1
        }
      }
    });
  }

  // Apply all formatting
  await this.sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests }
  });
}

getScoreColor(score, colors) {
  if (score >= 80) return colors.excellent;
  if (score >= 60) return colors.good;
  if (score >= 40) return colors.fair;
  return colors.poor;
}
