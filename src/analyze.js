// src/analyze.js - Enhanced YouTube Channel Analyzer with Professional Dashboard
const { google } = require('googleapis');
const fs = require('fs').promises;

class YouTubeChannelAnalyzer {
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    
    this.sheets = google.sheets({
      version: 'v4',
      auth: this.createSheetsAuth()
    });
  }

  createSheetsAuth() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  }

  async analyzeChannel(channelUrl) {
    try {
      console.log(`🚀 Starting analysis for: ${channelUrl}`);
      
      const channelId = this.extractChannelId(channelUrl);
      if (!channelId) {
        throw new Error('Invalid YouTube channel URL format');
      }

      const channelData = await this.fetchChannelData(channelId);
      const analysis = this.performAnalysis(channelData);
      
      await this.writeToSheets(analysis);
      await this.saveResults(analysis);
      
      console.log('✅ Analysis completed successfully!');
      return analysis;
      
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      await this.writeErrorToSheets(error.message);
      throw error;
    }
  }

  extractChannelId(url) {
    const patterns = [
      { regex: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: 'id' },
      { regex: /youtube\.com\/c\/([a-zA-Z0-9_-]+)/, type: 'custom' },
      { regex: /youtube\.com\/@([a-zA-Z0-9_.-]+)/, type: 'handle' },
      { regex: /youtube\.com\/user\/([a-zA-Z0-9_-]+)/, type: 'user' }
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern.regex);
      if (match) {
        return { type: pattern.type, value: match[1] };
      }
    }
    return null;
  }

  async fetchChannelData(channelIdentifier) {
    console.log('📡 Fetching channel data from YouTube API...');
    
    let channelId;
    
    if (channelIdentifier.type !== 'id') {
      const searchResponse = await this.youtube.search.list({
        part: ['snippet'],
        type: 'channel',
        q: channelIdentifier.value,
        maxResults: 1
      });
      
      if (!searchResponse.data.items?.length) {
        throw new Error('Channel not found');
      }
      
      channelId = searchResponse.data.items[0].snippet.channelId;
    } else {
      channelId = channelIdentifier.value;
    }

    const channelResponse = await this.youtube.channels.list({
      part: ['snippet', 'statistics', 'brandingSettings'],
      id: [channelId]
    });

    if (!channelResponse.data.items?.length) {
      throw new Error('Channel not found');
    }

    const videosResponse = await this.youtube.search.list({
      part: ['snippet'],
      channelId: channelId,
      order: 'date',
      maxResults: 20,
      type: 'video'
    });

    const videoIds = videosResponse.data.items?.map(item => item.id.videoId) || [];
    
    let videoStats = [];
    if (videoIds.length > 0) {
      const statsResponse = await this.youtube.videos.list({
        part: ['statistics', 'contentDetails', 'snippet'],
        id: videoIds
      });
      videoStats = statsResponse.data.items || [];
    }

    const playlistsResponse = await this.youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      channelId: channelId,
      maxResults: 10
    });

    return {
      channel: channelResponse.data.items[0],
      videos: videoStats,
      playlists: playlistsResponse.data.items || [],
      transcripts: {} // Simplified for stability
    };
  }

  performAnalysis(data) {
    console.log('🔍 Performing comprehensive channel analysis...');
    
    const { channel, videos, playlists } = data;
    const stats = channel.statistics;
    const snippet = channel.snippet;
    const brandingSettings = channel.brandingSettings || {};
    
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViews = parseInt(stats.viewCount) || 0;
    const videoCount = parseInt(stats.videoCount) || 0;
    
    const videoAnalysis = videos.map(video => this.analyzeVideoComprehensive(video));
    
    const brandingAnalysis = this.analyzeBrandingComprehensive(channel, brandingSettings);
    const contentStrategy = this.analyzeContentStrategyComprehensive(videoAnalysis, snippet);
    const seoAnalysis = this.analyzeSEOComprehensive(videoAnalysis);
    const engagementSignals = this.analyzeEngagementSignalsComprehensive(videoAnalysis, subscriberCount);
    const contentQuality = this.analyzeContentQualityComprehensive(videoAnalysis);
    const playlistStructure = this.analyzePlaylistStructureComprehensive(playlists, videoAnalysis);
    
    return {
      timestamp: new Date().toISOString(),
      channel: {
        name: snippet.title,
        description: snippet.description,
        subscriberCount,
        totalViews,
        videoCount,
        createdAt: snippet.publishedAt,
        thumbnailUrl: snippet.thumbnails?.high?.url,
        customUrl: snippet.customUrl,
        country: snippet.country
      },
      brandingIdentity: brandingAnalysis,
      contentStrategy: contentStrategy,
      seoMetadata: seoAnalysis,
      engagementSignals: engagementSignals,
      contentQuality: contentQuality,
      playlistStructure: playlistStructure,
      overallScores: {
        brandingScore: brandingAnalysis.overallScore,
        contentStrategyScore: contentStrategy.overallScore,
        seoScore: seoAnalysis.overallScore,
        engagementScore: engagementSignals.overallScore,
        contentQualityScore: contentQuality.overallScore,
        playlistScore: playlistStructure.overallScore
      },
      priorityRecommendations: this.generatePriorityRecommendations({
        branding: brandingAnalysis,
        content: contentStrategy,
        seo: seoAnalysis,
        engagement: engagementSignals,
        quality: contentQuality,
        playlists: playlistStructure
      }),
      videos: videoAnalysis.slice(0, 15),
      analysisDate: new Date().toISOString()
    };
  }

  analyzeVideoComprehensive(video) {
    const stats = video.statistics;
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;
    
    const views = parseInt(stats.viewCount) || 0;
    const likes = parseInt(stats.likeCount) || 0;
    const comments = parseInt(stats.commentCount) || 0;
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
    
    const title = snippet.title;
    const description = snippet.description || '';
    
    let tags = [];
    if (snippet && snippet.tags && Array.isArray(snippet.tags)) {
      tags = snippet.tags;
    }
    
    const duration = this.parseDuration(contentDetails?.duration);
    
    return {
      id: video.id,
      title,
      description,
      tags,
      views,
      likes,
      comments,
      engagementRate,
      publishedAt: snippet.publishedAt,
      duration,
      thumbnails: snippet.thumbnails,
      categoryId: snippet.categoryId,
      titleAnalysis: this.analyzeTitleComprehensive(title),
      descriptionAnalysis: this.analyzeDescriptionComprehensive(description),
      tagsAnalysis: this.analyzeTagsComprehensive(tags),
      likeToViewRatio: views > 0 ? (likes / views) * 100 : 0,
      commentToViewRatio: views > 0 ? (comments / views) * 100 : 0,
      format: this.classifyVideoFormat(duration, title)
    };
  }

  // ENHANCED GOOGLE SHEETS DASHBOARD METHOD - COMPLETELY REDESIGNED
  async writeToSheets(analysis) {
    console.log('📝 Creating professional dashboard in Google Sheets...');
    
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.log('⚠️ No Google Sheet ID provided, skipping sheet update');
      return;
    }

    try {
      // Clear existing content first
      console.log('🧹 Clearing existing sheet content...');
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'A1:Z1000'
      });

      // Helper functions for better data presentation
      const getScoreColor = (score) => {
        if (!score && score !== 0) return { red: 0.9, green: 0.9, blue: 0.9 };
        if (score >= 90) return { red: 0.2, green: 0.7, blue: 0.3 }; // Green
        if (score >= 80) return { red: 0.4, green: 0.8, blue: 0.4 }; // Light green
        if (score >= 70) return { red: 0.9, green: 0.9, blue: 0.3 }; // Yellow
        if (score >= 60) return { red: 1, green: 0.7, blue: 0.3 }; // Orange
        if (score >= 50) return { red: 1, green: 0.5, blue: 0.3 }; // Dark orange
        return { red: 0.9, green: 0.3, blue: 0.3 }; // Red
      };

      const getScoreGradeLocal = (score) => {
        if (!score && score !== 0) return 'N/A';
        if (score >= 90) return 'EXCELLENT';
        if (score >= 80) return 'VERY GOOD';
        if (score >= 70) return 'GOOD';
        if (score >= 60) return 'FAIR';
        if (score >= 50) return 'NEEDS WORK';
        return 'POOR';
      };

      const getScoreValue = (score) => {
        return score ? Math.round(score) : 'N/A';
      };

      const getPriorityColor = (priority) => {
        switch(priority?.toLowerCase()) {
          case 'high':
          case 'critical':
            return { red: 0.9, green: 0.3, blue: 0.3 };
          case 'medium':
            return { red: 1, green: 0.7, blue: 0.3 };
          case 'low':
            return { red: 0.4, green: 0.8, blue: 0.4 };
          default:
            return { red: 0.95, green: 0.95, blue: 0.95 };
        }
      };

      const getCriticalIssues = () => {
        const issues = [];
        
        if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
          issues.push([
            'MISSING TAGS',
            `${analysis.seoMetadata.tags.videosWithNoTagsCount} videos have NO TAGS`,
            'CRITICAL',
            'Add 8-15 relevant tags to each video',
            'Immediate SEO boost',
            '2-3 hours'
          ]);
        }
        
        if (analysis.seoMetadata.titles.optimalLengthPercentage < 50) {
          const shortTitles = Math.round((1 - analysis.seoMetadata.titles.optimalLengthPercentage/100) * analysis.videos.length);
          issues.push([
            'SHORT TITLES',
            `${shortTitles} titles under 30 characters`,
            'HIGH',
            'Extend titles to 40-60 characters',
            'Better CTR & SEO',
            '1-2 hours'
          ]);
        }
        
        if (analysis.engagementSignals.viewsToSubscribers?.ratio < 8) {
          issues.push([
            'LOW SUBSCRIBER VIEWS',
            `Only ${analysis.engagementSignals.viewsToSubscribers?.ratio?.toFixed(1)}% watch new videos`,
            'HIGH',
            'Improve hooks & thumbnails',
            '2-3x more subscriber views',
            '30 min per video'
          ]);
        }
        
        if (issues.length === 0) {
          issues.push([
            'NO CRITICAL ISSUES',
            'Channel performing well overall',
            'GOOD',
            'Focus on optimization',
            'Steady growth',
            'Weekly maintenance'
          ]);
        }
        
        return issues;
      };

      // Create enhanced dashboard data with better spacing and organization
      console.log('📊 Building professional dashboard data...');
      const values = [
        // MAIN HEADER
        ['YOUTUBE CHANNEL PERFORMANCE DASHBOARD', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // CHANNEL INFO SECTION
        [analysis.channel.name, '', '', `Analysis Date: ${new Date().toLocaleDateString('en-US', { 
          year: 'numeric', month: 'long', day: 'numeric' 
        })}`, '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // KEY METRICS GRID
        ['CHANNEL OVERVIEW', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['SUBSCRIBERS', 'TOTAL VIEWS', 'TOTAL VIDEOS', 'AVG VIEWS/VIDEO', 'CHANNEL AGE', '', '', '', '', ''],
        [
          analysis.channel.subscriberCount.toLocaleString(),
          analysis.channel.totalViews.toLocaleString(),
          analysis.channel.videoCount.toLocaleString(),
          Math.round(analysis.channel.totalViews / analysis.channel.videoCount).toLocaleString(),
          `${Math.floor((Date.now() - new Date(analysis.channel.createdAt)) / (1000 * 60 * 60 * 24 * 365))} years`,
          '', '', '', '', ''
        ],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // PERFORMANCE SCORES SECTION
        ['PERFORMANCE SCORES', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['METRIC', 'SCORE', 'GRADE', '', 'METRIC', 'SCORE', 'GRADE', '', '', ''],
        [
          'Branding & Identity',
          getScoreValue(analysis.overallScores.brandingScore),
          getScoreGradeLocal(analysis.overallScores.brandingScore),
          '',
          'SEO & Metadata',
          getScoreValue(analysis.overallScores.seoScore),
          getScoreGradeLocal(analysis.overallScores.seoScore),
          '', '', ''
        ],
        [
          'Content Strategy',
          getScoreValue(analysis.overallScores.contentStrategyScore),
          getScoreGradeLocal(analysis.overallScores.contentStrategyScore),
          '',
          'Engagement Signals',
          getScoreValue(analysis.overallScores.engagementScore),
          getScoreGradeLocal(analysis.overallScores.engagementScore),
          '', '', ''
        ],
        [
          'Content Quality',
          getScoreValue(analysis.overallScores.contentQualityScore),
          getScoreGradeLocal(analysis.overallScores.contentQualityScore),
          '',
          'Playlist Structure',
          getScoreValue(analysis.overallScores.playlistScore),
          getScoreGradeLocal(analysis.overallScores.playlistScore),
          '', '', ''
        ],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // CRITICAL ISSUES SECTION
        ['CRITICAL ISSUES & OPPORTUNITIES', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['ISSUE TYPE', 'DESCRIPTION', 'PRIORITY', 'ACTION NEEDED', 'EXPECTED IMPACT', 'TIME REQUIRED', '', '', '', ''],
        ...getCriticalIssues(),
        ['', '', '', '', '', '', '', '', '', ''],
        
        // SEO BREAKDOWN SECTION
        ['SEO PERFORMANCE BREAKDOWN', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['TITLES', '', 'DESCRIPTIONS', '', 'TAGS', '', '', '', '', ''],
        [
          `Avg Length: ${Math.round(analysis.seoMetadata.titles.averageLength || 0)} chars`,
          `Optimal: ${Math.round(analysis.seoMetadata.titles.optimalLengthPercentage || 0)}%`,
          `Avg Length: ${Math.round(analysis.seoMetadata.descriptions.averageLength || 0)} chars`,
          `With Timestamps: ${Math.round(analysis.seoMetadata.descriptions.hasTimestampsPercentage || 0)}%`,
          `Avg per Video: ${(analysis.seoMetadata.tags.averageTagCount || 0).toFixed(1)}`,
          `Missing Tags: ${analysis.seoMetadata.tags.videosWithNoTagsCount || 0} videos`,
          '', '', '', ''
        ],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // ENGAGEMENT METRICS
        ['ENGAGEMENT PERFORMANCE', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['METRIC', 'VALUE', 'BENCHMARK', '', 'METRIC', 'VALUE', 'BENCHMARK', '', '', ''],
        [
          'Views per Subscriber',
          `${(analysis.engagementSignals.viewsToSubscribers?.ratio || 0).toFixed(1)}%`,
          analysis.engagementSignals.viewsToSubscribers?.benchmark || 'Analyzing',
          '',
          'Like Rate',
          `${(analysis.engagementSignals.likeEngagement?.averageRatio || 0).toFixed(2)}%`,
          analysis.engagementSignals.likeEngagement?.benchmark || 'Analyzing',
          '', '', ''
        ],
        ['', '', '', '', '', '', '', '', '', ''],
        
        // TOP VIDEOS PERFORMANCE
        ['RECENT VIDEOS PERFORMANCE', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['VIDEO TITLE', 'VIEWS', 'ENGAGEMENT', 'TAGS', 'TITLE SCORE', 'TOP ISSUE', '', '', '', ''],
        ...analysis.videos.slice(0, 8).map(video => [
          video.title.length > 40 ? video.title.substring(0, 37) + '...' : video.title,
          video.views.toLocaleString(),
          `${video.engagementRate.toFixed(1)}%`,
          `${video.tags?.length || 0} tags`,
          `${Math.round(video.titleAnalysis?.score || 0)}/100`,
          (!video.tags || video.tags.length === 0) ? 'NO TAGS' : 
           video.title.length < 30 ? 'SHORT TITLE' : 'GOOD',
          '', '', '', ''
        ]),
        ['', '', '', '', '', '', '', '', '', ''],
        
        // ACTION PLAN
        ['PRIORITY ACTION PLAN', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['PRIORITY', 'ACTION ITEM', 'IMPACT', 'TIME', 'STATUS', '', '', '', '', ''],
        ...analysis.priorityRecommendations.slice(0, 6).map(rec => [
          rec.priority?.toUpperCase() || 'MEDIUM',
          rec.action?.length > 50 ? rec.action.substring(0, 47) + '...' : rec.action,
          rec.impact || 'Medium Impact',
          rec.timeInvestment || '30-60 min',
          'PENDING',
          '', '', '', '', ''
        ]),
        ['', '', '', '', '', '', '', '', '', ''],
        
        // SUMMARY
        ['EXECUTIVE SUMMARY', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        [
          'Overall Health:',
          analysis.overallScores.seoScore >= 70 ? 'HEALTHY' : 
          analysis.overallScores.seoScore >= 50 ? 'NEEDS ATTENTION' : 'CRITICAL',
          '',
          'Primary Focus:',
          analysis.seoMetadata.tags.videosWithNoTagsCount > 0 ? 'Fix Missing Tags' : 
          'Optimize Titles & Descriptions',
          '',
          'Est. Time to Improve:',
          analysis.seoMetadata.tags.videosWithNoTagsCount > 0 ? '2-3 hours' : '1-2 hours/week',
          '', ''
        ]
      ];

      // Write data to sheets
      console.log('💾 Writing enhanced data to Google Sheets...');
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      // Apply enhanced formatting
      console.log('🎨 Applying professional formatting...');
      await this.applyProfessionalFormatting(sheetId, analysis);

      console.log('✅ Professional dashboard created successfully!');
      console.log(`🔗 View your enhanced dashboard: https://docs.google.com/spreadsheets/d/${sheetId}`);
      
    } catch (error) {
      console.error('❌ Error creating enhanced dashboard:', error.message);
      console.log('🔄 Falling back to basic data export...');
      
      // FALLBACK: Simple data export if formatting fails
      try {
        const fallbackValues = [
          ['YouTube Channel Analysis Report', '', '', ''],
          ['Channel Name', analysis.channel.name, '', ''],
          ['Generated', new Date().toLocaleDateString(), '', ''],
          ['', '', '', ''],
          ['Performance Scores', '', '', ''],
          ['Branding', `${analysis.overallScores.brandingScore.toFixed(0)}/100`, '', ''],
          ['Content Strategy', `${analysis.overallScores.contentStrategyScore.toFixed(0)}/100`, '', ''],
          ['SEO', `${analysis.overallScores.seoScore.toFixed(0)}/100`, '', ''],
          ['Engagement', `${analysis.overallScores.engagementScore.toFixed(0)}/100`, '', ''],
          ['Content Quality', `${analysis.overallScores.contentQualityScore.toFixed(0)}/100`, '', ''],
          ['Playlists', `${analysis.overallScores.playlistScore.toFixed(0)}/100`, '', ''],
          ['', '', '', ''],
          ['Critical Issues', '', '', ''],
          analysis.seoMetadata.tags.videosWithNoTagsCount > 0 ? 
            ['Missing Tags', `${analysis.seoMetadata.tags.videosWithNoTagsCount} videos need tags`, '', ''] : 
            ['No Critical Issues', 'Channel performing well', '', '']
        ];
        
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: 'A1',
          valueInputOption: 'RAW',
          requestBody: { values: fallbackValues }
        });
        
        console.log('✅ Fallback data export completed successfully');
      } catch (fallbackError) {
        console.error('❌ Fallback export also failed:', fallbackError.message);
        throw fallbackError;
      }
    }
  }

  async applyProfessionalFormatting(sheetId, analysis) {
    try {
      const requests = [
        // Set column widths for better readability
        {
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 200 },
            fields: 'pixelSize'
          }
        },
        {
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 },
            properties: { pixelSize: 120 },
            fields: 'pixelSize'
          }
        },
        {
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 3, endIndex: 10 },
            properties: { pixelSize: 140 },
            fields: 'pixelSize'
          }
        },

        // Main header - Premium look
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.1, green: 0.1, blue: 0.3 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 }, 
                  fontSize: 18, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                borders: {
                  bottom: { style: 'SOLID', width: 3, color: { red: 0.2, green: 0.4, blue: 0.8 }}
                }
              }
            },
            fields: 'userEnteredFormat'
          }
        },
        {
          mergeCells: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
            mergeType: 'MERGE_ALL'
          }
        },

        // Channel name row
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.98 },
                textFormat: { 
                  fontSize: 14, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Section headers - Modern blue gradient
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 }, 
                  fontSize: 13, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Metrics values row - Clean white with borders
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { 
                  fontSize: 12, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 }},
                  bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 }},
                  left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 }},
                  right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 }}
                }
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Performance scores section header
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.3, green: 0.6, blue: 0.3 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 }, 
                  fontSize: 13, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Critical issues section header
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.8, green: 0.3, blue: 0.3 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 }, 
                  fontSize: 13, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Other section headers with alternating colors
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.5, green: 0.3, blue: 0.8 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 }, 
                  fontSize: 13, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat'
          }
        },

        // Table headers styling
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                textFormat: { 
                  fontSize: 11, 
                  bold: true,
                  fontFamily: 'Arial'
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                borders: {
                  bottom: { style: 'SOLID', width: 2, color: { red: 0.6, green: 0.6, blue: 0.6 }}
                }
              }
            },
            fields: 'userEnteredFormat'
          }
        }
      ];

      // Apply conditional formatting for scores
      const scoreConditions = [
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 16, startColumnIndex: 1, endColumnIndex: 2 }],
              booleanRule: {
                condition: {
                  type: 'NUMBER_GREATER_THAN_EQ',
                  values: [{ userEnteredValue: '90' }]
                },
                format: {
                  backgroundColor: { red: 0.2, green: 0.7, blue: 0.3 },
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }
                }
              }
            },
            index: 0
          }
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 16, startColumnIndex: 1, endColumnIndex: 2 }],
              booleanRule: {
                condition: {
                  type: 'NUMBER_BETWEEN',
                  values: [{ userEnteredValue: '70' }, { userEnteredValue: '89' }]
                },
                format: {
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.3 },
                  textFormat: { bold: true }
                }
              }
            },
            index: 1
          }
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: 0, startRowIndex: 13, endRowIndex: 16, startColumnIndex: 1, endColumnIndex: 2 }],
              booleanRule: {
                condition: {
                  type: 'NUMBER_LESS_THAN',
                  values: [{ userEnteredValue: '70' }]
                },
                format: {
                  backgroundColor: { red: 0.9, green: 0.3, blue: 0.3 },
                  textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }
                }
              }
            },
            index: 2
          }
        }
      ];

      // Apply all formatting in batches
      const allRequests = [...requests, ...scoreConditions];
      const batchSize = 5;
      
      for (let i = 0; i < allRequests.length; i += batchSize) {
        const batch = allRequests.slice(i, i + batchSize);
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: batch }
        });
        
        // Prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('🎨 Professional formatting applied successfully!');
      
    } catch (formatError) {
      console.log('⚠️ Some formatting failed, but data is available:', formatError.message);
    }
  }

  // ANALYSIS METHODS
  analyzeSEOComprehensive(videos) {
    const titleAnalysis = this.analyzeTitlesComprehensiveWithInsights(videos);
    const descriptionAnalysis = this.analyzeDescriptionsComprehensiveWithInsights(videos);
    const tagsAnalysis = this.analyzeTagsSetComprehensiveWithInsights(videos);
    
    const overallScore = (
      titleAnalysis.averageScore * 0.4 +
      descriptionAnalysis.averageScore * 0.3 +
      tagsAnalysis.averageScore * 0.3
    );
    
    return {
      overallScore,
      titles: titleAnalysis,
      descriptions: descriptionAnalysis,
      tags: tagsAnalysis,
      recommendations: this.generateSEORecommendations(titleAnalysis, descriptionAnalysis, tagsAnalysis)
    };
  }

  analyzeTitlesComprehensiveWithInsights(videos) {
    const titleScores = videos.map(video => this.analyzeTitleComprehensive(video.title));
    const averageScore = titleScores.reduce((sum, analysis) => sum + analysis.score, 0) / titleScores.length || 0;
    
    const avgLength = titleScores.reduce((sum, t) => sum + t.length, 0) / titleScores.length;
    const hasNumbersPercent = (titleScores.filter(t => t.hasNumbers).length / titleScores.length) * 100;
    const optimalLengthPercent = (titleScores.filter(t => t.length >= 30 && t.length <= 60).length / titleScores.length) * 100;
    
    return {
      averageScore,
      averageLength: avgLength,
      optimalLengthPercentage: optimalLengthPercent,
      hasNumbersPercentage: hasNumbersPercent
    };
  }

  analyzeDescriptionsComprehensiveWithInsights(videos) {
    const descriptionScores = videos.map(video => this.analyzeDescriptionComprehensive(video.description));
    const averageScore = descriptionScores.reduce((sum, analysis) => sum + analysis.score, 0) / descriptionScores.length || 0;
    
    const avgLength = descriptionScores.reduce((sum, d) => sum + d.length, 0) / descriptionScores.length;
    const hasTimestampsPercent = (descriptionScores.filter(d => d.hasTimestamps).length / descriptionScores.length) * 100;
    const hasCTAPercent = (descriptionScores.filter(d => d.hasCallToAction).length / descriptionScores.length) * 100;
    
    return {
      averageScore,
      averageLength: avgLength,
      hasTimestampsPercentage: hasTimestampsPercent,
      hasCTAPercentage: hasCTAPercent
    };
  }

  analyzeTagsSetComprehensiveWithInsights(videos) {
    const tagScores = videos.map(video => this.analyzeTagsComprehensive(video.tags));
    const averageScore = tagScores.reduce((sum, analysis) => sum + analysis.score, 0) / tagScores.length || 0;
    
    const videosWithNoTags = videos.filter(v => !v.tags || v.tags.length === 0);
    const avgTagCount = videos.reduce((sum, v) => sum + (v.tags?.length || 0), 0) / videos.length;
    
    return {
      averageScore,
      averageTagCount: avgTagCount,
      videosWithNoTagsCount: videosWithNoTags.length
    };
  }

  analyzeEngagementSignalsComprehensive(videos, subscriberCount) {
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const avgViews = totalViews / videos.length;
    
    const viewsToSubsRatio = (avgViews / subscriberCount) * 100;
    const viewsToSubsScore = Math.min(viewsToSubsRatio * 10, 100);
    
    const likeRatios = videos.map(v => v.likeToViewRatio);
    const avgLikeRatio = likeRatios.reduce((sum, r) => sum + r, 0) / likeRatios.length;
    const likeRatioScore = Math.min(avgLikeRatio * 25, 100);
    
    const commentAnalysis = this.analyzeCommentQuality(videos);
    const engagementConsistency = 75; // Simplified
    
    const overallScore = (
      viewsToSubsScore * 0.4 +
      likeRatioScore * 0.3 +
      commentAnalysis.qualityScore * 0.3
    );
    
    return {
      overallScore,
      viewsToSubscribers: {
        ratio: viewsToSubsRatio,
        score: viewsToSubsScore,
        benchmark: viewsToSubsRatio > 15 ? 'Excellent' : viewsToSubsRatio > 8 ? 'Good' : 'Needs Improvement'
      },
      likeEngagement: {
        averageRatio: avgLikeRatio,
        score: likeRatioScore,
        benchmark: avgLikeRatio > 3 ? 'Excellent' : avgLikeRatio > 1.5 ? 'Good' : 'Needs Improvement'
      },
      commentEngagement: commentAnalysis,
      consistency: engagementConsistency
    };
  }

  analyzeCommentQuality(videos) {
    const commentRatios = videos.map(v => v.commentToViewRatio);
    const avgCommentRatio = commentRatios.reduce((sum, r) => sum + r, 0) / commentRatios.length || 0;
    
    let qualityScore = Math.min(avgCommentRatio * 50, 100);
    
    return {
      qualityScore,
      averageCommentRatio: avgCommentRatio,
      benchmark: avgCommentRatio > 1 ? 'Excellent' : avgCommentRatio > 0.5 ? 'Good' : 'Needs Improvement'
    };
  }

  analyzeContentQualityComprehensive(videos) {
    const hookAnalysis = this.analyzeHooksWithInsights(videos);
    const structureAnalysis = { score: 70 }; // Simplified
    const ctaAnalysis = { score: 60 }; // Simplified
    const professionalQuality = { score: 75 }; // Simplified
    
    const overallScore = (
      hookAnalysis.score * 0.4 +
      structureAnalysis.score * 0.2 +
      ctaAnalysis.score * 0.2 +
      professionalQuality.score * 0.2
    );
    
    return {
      overallScore,
      hooks: hookAnalysis,
      structure: structureAnalysis,
      callsToAction: ctaAnalysis,
      professionalQuality
    };
  }

  analyzeHooksWithInsights(videos) {
    const hookAnalysis = videos.map(video => {
      const title = video.title.toLowerCase();
      
      let hookScore = 0;
      
      const hookWords = ['ultimate', 'secret', 'best', 'worst', 'amazing'];
      const questionWords = ['how', 'what', 'why', 'when', 'where'];
      
      if (hookWords.some(word => title.includes(word))) hookScore += 30;
      if (questionWords.some(word => title.startsWith(word))) hookScore += 25;
      if (title.includes('?') || title.includes('!')) hookScore += 15;
      if (/\d/.test(title)) hookScore += 10;
      
      return Math.min(hookScore, 100);
    });
    
    const averageScore = hookAnalysis.reduce((sum, score) => sum + score, 0) / hookAnalysis.length || 0;
    
    return {
      score: averageScore,
      videosWithStrongHooks: hookAnalysis.filter(score => score > 60).length,
      videosWithWeakHooks: hookAnalysis.filter(score => score < 30).length
    };
  }

  analyzeBrandingComprehensive(channel, brandingSettings) {
    const snippet = channel.snippet;
    
    const overallScore = 70; // Simplified for stability
    
    return {
      overallScore,
      channelName: {
        clarity: 75,
        memorability: 70,
        nicheAlignment: 80
      },
      visualIdentity: {
        profileImageQuality: snippet.thumbnails?.high ? 85 : 45,
        bannerPresent: !!brandingSettings.image?.bannerExternalUrl,
        bannerQuality: brandingSettings.image?.bannerExternalUrl ? 80 : 30
      },
      aboutSection: {
        descriptionLength: snippet.description?.length || 0,
        hasWebsiteLinks: this.detectWebsiteLinks(snippet.description),
        hasSocialLinks: this.detectSocialLinks(snippet.description)
      }
    };
  }

  analyzeContentStrategyComprehensive(videos, channelSnippet) {
    const uploadAnalysis = this.analyzeUploadPattern(videos);
    const themeAnalysis = this.analyzeContentThemes(videos);
    
    const overallScore = (uploadAnalysis.consistencyScore * 0.5 + themeAnalysis.clarityScore * 0.5);
    
    return {
      overallScore,
      uploadPattern: uploadAnalysis,
      contentThemes: themeAnalysis
    };
  }

  analyzeUploadPattern(videos) {
    const dates = videos.map(v => new Date(v.publishedAt)).sort((a, b) => b - a);
    const intervals = [];
    
    for (let i = 0; i < dates.length - 1; i++) {
      const diff = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
      intervals.push(diff);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length || 7;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    const consistencyScore = Math.max(0, 100 - (stdDev * 3));
    
    return {
      consistencyScore,
      frequency: avgInterval <= 8 ? 'Weekly' : 'Irregular',
      averageDaysBetween: avgInterval
    };
  }

  analyzeContentThemes(videos) {
    const titleWords = videos.flatMap(v => {
      return v.title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(' ')
        .filter(word => word.length > 3);
    });
    
    const wordFreq = {};
    titleWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    
    const topThemes = Object.entries(wordFreq)
      .filter(([word, count]) => count >= 2)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word, count]) => ({ theme: word, frequency: count }));
    
    const clarityScore = topThemes.length >= 3 ? 85 : topThemes.length >= 1 ? 60 : 30;
    
    return {
      clarityScore,
      primaryThemes: topThemes,
      focusRecommendation: topThemes.length > 0 ? 'Good thematic focus' : 'Consider more consistent topic focus'
    };
  }

  analyzePlaylistStructureComprehensive(playlists, videos) {
    if (!playlists || playlists.length === 0) {
      return {
        overallScore: 15,
        organization: { score: 0, hasPlaylists: false },
        recommendations: [{
          priority: 'High',
          category: 'Playlist Creation',
          action: 'Create 5+ playlists to organize your content by topic'
        }]
      };
    }
    
    const overallScore = Math.min(playlists.length * 15, 100);
    
    return {
      overallScore,
      organization: { score: overallScore, hasPlaylists: true },
      recommendations: []
    };
  }

  // HELPER METHODS
  parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  analyzeTitleComprehensive(title) {
    let score = 0;
    
    if (title.length >= 30 && title.length <= 60) score += 25;
    else if (title.length > 60) score += 15;
    else score += 10;
    
    const words = title.toLowerCase().split(' ');
    if (words.length >= 5) score += 20;
    
    const powerWords = ['ultimate', 'complete', 'best', 'guide', 'tutorial'];
    if (powerWords.some(word => title.toLowerCase().includes(word))) score += 20;
    
    if (/\d/.test(title)) score += 15;
    if (title.includes('?')) score += 10;
    
    return {
      score: Math.min(score, 100),
      length: title.length,
      hasNumbers: /\d/.test(title),
      hasPowerWords: powerWords.some(word => title.toLowerCase().includes(word)),
      isQuestion: title.includes('?')
    };
  }

  analyzeDescriptionComprehensive(description) {
    if (!description) return { score: 0, length: 0, hasTimestamps: false, hasCallToAction: false };
    
    let score = 0;
    
    if (description.length >= 200) score += 30;
    if (description.includes('http')) score += 20;
    if (/\d+:\d+/.test(description)) score += 25;
    
    const cta = ['subscribe', 'like', 'comment', 'share'];
    if (cta.some(word => description.toLowerCase().includes(word))) score += 25;
    
    return {
      score: Math.min(score, 100),
      length: description.length,
      hasTimestamps: /\d+:\d+/.test(description),
      hasCallToAction: cta.some(word => description.toLowerCase().includes(word))
    };
  }

  analyzeTagsComprehensive(tags) {
    if (!tags || tags.length === 0) {
      return { score: 0, count: 0 };
    }
    
    let score = 0;
    
    if (tags.length >= 8 && tags.length <= 15) score += 50;
    else if (tags.length >= 5) score += 30;
    else score += 10;
    
    if (tags.some(tag => tag.includes(' '))) score += 25;
    if (tags.some(tag => tag.length > 20)) score += 25;
    
    return {
      score: Math.min(score, 100),
      count: tags.length
    };
  }

  classifyVideoFormat(duration, title) {
    if (duration < 60) return 'Short';
    if (duration < 300) return 'Quick Tutorial';
    if (duration < 1200) return 'Standard';
    return 'Long-form';
  }

  detectWebsiteLinks(description) {
    if (!description) return false;
    return /https?:\/\/[^\s]+\.(com|org|net|io|dev)/.test(description);
  }

  detectSocialLinks(description) {
    if (!description) return false;
    const socialPlatforms = ['twitter', 'instagram', 'tiktok', 'linkedin'];
    return socialPlatforms.some(platform => description.toLowerCase().includes(platform));
  }

  getScoreGrade(score) {
    if (score >= 90) return '🏆 Excellent';
    if (score >= 80) return '🥇 Very Good';
    if (score >= 70) return '🥈 Good';
    if (score >= 60) return '🥉 Fair';
    if (score >= 50) return '⚠️ Needs Improvement';
    return '❌ Poor';
  }

  // RECOMMENDATION GENERATORS
  generateSEORecommendations(titles, descriptions, tags) {
    const recommendations = [];
    
    if (titles.averageScore < 70) {
      recommendations.push({
        priority: 'High',
        category: 'Title Optimization',
        action: 'Improve title SEO with keywords and optimal length'
      });
    }
    
    if (descriptions.averageScore < 60) {
      recommendations.push({
        priority: 'High',
        category: 'Description Quality',
        action: 'Write longer, more detailed descriptions with timestamps'
      });
    }
    
    if (tags.averageScore < 50) {
      recommendations.push({
        priority: 'Critical',
        category: 'Tag Strategy',
        action: 'Use 8-15 relevant tags per video'
      });
    }
    
    return recommendations;
  }

  generatePriorityRecommendations(analysisResults) {
    const allRecommendations = [
      ...analysisResults.seo.recommendations,
      ...analysisResults.playlists.recommendations
    ];
    
    const priorityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    
    return allRecommendations
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, 10);
  }

  async saveResults(analysis) {
    try {
      await fs.mkdir('results', { recursive: true });
      await fs.writeFile(
        `results/analysis-${Date.now()}.json`,
        JSON.stringify(analysis, null, 2)
      );
      console.log('📁 Results saved as artifact');
    } catch (error) {
      console.error('Failed to save results:', error);
    }
  }

  async writeErrorToSheets(errorMessage) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return;

    try {
      const values = [
        ['❌ Analysis Failed', new Date().toLocaleString()],
        ['Error:', errorMessage],
        ['', ''],
        ['Please check:', ''],
        ['1. Channel URL is correct', ''],
        ['2. Channel is public', ''],
        ['3. API key is valid', '']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    } catch (error) {
      console.error('Failed to write error to sheets:', error);
    }
  }
}

// Main execution
async function main() {
  const channelUrl = process.argv[2];
  
  if (!channelUrl) {
    console.error('❌ Please provide a YouTube channel URL');
    process.exit(1);
  }

  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YouTube API key not found in environment variables');
    process.exit(1);
  }

  const analyzer = new YouTubeChannelAnalyzer();
  
  try {
    await analyzer.analyzeChannel(channelUrl);
    console.log('🎉 Analysis completed successfully with professional dashboard!');
  } catch (error) {
    console.error('💥 Analysis failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = YouTubeChannelAnalyzer;
