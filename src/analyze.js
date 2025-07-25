// src/analyze.js - Main YouTube Channel Analyzer
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
      
      // Extract channel ID
      const channelId = this.extractChannelId(channelUrl);
      if (!channelId) {
        throw new Error('Invalid YouTube channel URL format');
      }

      // Fetch channel data
      const channelData = await this.fetchChannelData(channelId);
      
      // Perform analysis
      const analysis = this.performAnalysis(channelData);
      
      // Write to Google Sheets
      await this.writeToSheets(analysis);
      
      // Save results as artifact
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
    
    // Get channel ID if not direct ID
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

    // Get channel details
    const channelResponse = await this.youtube.channels.list({
      part: ['snippet', 'statistics', 'brandingSettings'],
      id: [channelId]
    });

    if (!channelResponse.data.items?.length) {
      throw new Error('Channel not found');
    }

    // Get recent videos
    const videosResponse = await this.youtube.search.list({
      part: ['snippet'],
      channelId: channelId,
      order: 'date',
      maxResults: 20,
      type: 'video'
    });

    const videoIds = videosResponse.data.items?.map(item => item.id.videoId) || [];
    
    // Get video statistics
    let videoStats = [];
    if (videoIds.length > 0) {
      const statsResponse = await this.youtube.videos.list({
        part: ['statistics', 'contentDetails', 'snippet'],
        id: videoIds
      });
      videoStats = statsResponse.data.items || [];
    }

    // Get playlists
    const playlistsResponse = await this.youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      channelId: channelId,
      maxResults: 10
    });

    return {
      channel: channelResponse.data.items[0],
      videos: videoStats,
      playlists: playlistsResponse.data.items || []
    };
  }

  performAnalysis(data) {
    console.log('🔍 Performing channel analysis...');
    
    const { channel, videos, playlists } = data;
    const stats = channel.statistics;
    const snippet = channel.snippet;
    
    // Basic metrics
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViews = parseInt(stats.totalViews) || 0;
    const videoCount = parseInt(stats.videoCount) || 0;
    
    // Video analysis
    const videoAnalysis = videos.map(video => this.analyzeVideo(video));
    const avgViews = videoAnalysis.reduce((sum, v) => sum + v.views, 0) / videoAnalysis.length || 0;
    const avgEngagement = videoAnalysis.reduce((sum, v) => sum + v.engagementRate, 0) / videoAnalysis.length || 0;
    
    // SEO Analysis
    const seoScores = videoAnalysis.map(v => ({
      title: this.analyzeTitleSEO(v.title),
      description: this.analyzeDescriptionSEO(v.description),
      tags: this.analyzeTagsSEO(v.tags)
    }));
    
    const avgSeoScore = seoScores.reduce((sum, scores) => {
      return sum + (scores.title + scores.description + scores.tags) / 3;
    }, 0) / seoScores.length || 0;

    // Upload consistency
    const uploadConsistency = this.calculateUploadConsistency(videoAnalysis);
    
    // Content strategy
    const contentThemes = this.extractContentThemes(videoAnalysis);
    
    // Branding analysis
    const brandingScore = this.analyzeBranding(channel);
    
    return {
      timestamp: new Date().toISOString(),
      channel: {
        name: snippet.title,
        description: snippet.description,
        subscriberCount,
        totalViews,
        videoCount,
        createdAt: snippet.publishedAt,
        thumbnailUrl: snippet.thumbnails?.high?.url
      },
      metrics: {
        avgViews: Math.round(avgViews),
        avgEngagement: Math.round(avgEngagement * 100) / 100,
        seoScore: Math.round(avgSeoScore * 100) / 100,
        uploadConsistency: Math.round(uploadConsistency * 100) / 100,
        brandingScore: Math.round(brandingScore * 100) / 100,
        playlistCount: playlists.length
      },
      videos: videoAnalysis.slice(0, 10), // Top 10 for sheets
      recommendations: this.generateRecommendations({
        seoScore: avgSeoScore,
        uploadConsistency,
        brandingScore,
        playlistCount: playlists.length,
        avgEngagement
      }),
      contentThemes,
      analysis: {
        strengths: this.identifyStrengths(avgSeoScore, uploadConsistency, brandingScore, avgEngagement),
        improvements: this.identifyImprovements(avgSeoScore, uploadConsistency, brandingScore, avgEngagement)
      }
    };
  }

  analyzeVideo(video) {
    const stats = video.statistics;
    const snippet = video.snippet;
    
    const views = parseInt(stats.viewCount) || 0;
    const likes = parseInt(stats.likeCount) || 0;
    const comments = parseInt(stats.commentCount) || 0;
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
    
    return {
      title: snippet.title,
      views,
      likes,
      comments,
      engagementRate,
      description: snippet.description || '',
      tags: snippet.tags || [],
      publishedAt: snippet.publishedAt,
      duration: video.contentDetails?.duration
    };
  }

  analyzeTitleSEO(title) {
    let score = 0;
    if (title.length >= 30 && title.length <= 60) score += 25;
    if (/\d/.test(title)) score += 20;
    if (title.toLowerCase().includes('how to') || title.toLowerCase().includes('tutorial')) score += 20;
    if (title.split(' ').length >= 5) score += 20;
    if (title.includes('?') || title.includes('!')) score += 15;
    return Math.min(score, 100);
  }

  analyzeDescriptionSEO(description) {
    if (!description) return 0;
    let score = 0;
    if (description.length >= 200) score += 30;
    if (description.includes('http')) score += 20;
    if (description.includes('\n')) score += 15;
    if (/\d+:\d+/.test(description)) score += 20; // Timestamps
    if (description.toLowerCase().includes('subscribe')) score += 15;
    return Math.min(score, 100);
  }

  analyzeTagsSEO(tags) {
    if (!tags || tags.length === 0) return 0;
    let score = 0;
    if (tags.length >= 8) score += 40;
    if (tags.length >= 15) score += 30;
    if (tags.some(tag => tag.length > 15)) score += 30;
    return Math.min(score, 100);
  }

  calculateUploadConsistency(videos) {
    if (videos.length < 2) return 0;
    
    const dates = videos.map(v => new Date(v.publishedAt)).sort((a, b) => b - a);
    const intervals = [];
    
    for (let i = 0; i < dates.length - 1; i++) {
      const diff = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
      intervals.push(diff);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    return Math.max(0, (100 - stdDev * 2)) / 100;
  }

  extractContentThemes(videos) {
    const allTags = videos.flatMap(v => v.tags);
    const tagFreq = {};
    
    allTags.forEach(tag => {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    });
    
    return Object.entries(tagFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  analyzeBranding(channel) {
    const snippet = channel.snippet;
    let score = 0;
    
    // Channel name quality
    if (snippet.title.length >= 5 && snippet.title.length <= 50) score += 20;
    
    // Description quality
    if (snippet.description && snippet.description.length >= 100) score += 20;
    
    // Profile image
    if (snippet.thumbnails?.high) score += 20;
    
    // Custom URL
    if (snippet.customUrl) score += 20;
    
    // Branding settings
    if (channel.brandingSettings?.image?.bannerExternalUrl) score += 20;
    
    return score / 100;
  }

  generateRecommendations(metrics) {
    const recommendations = [];
    
    if (metrics.seoScore < 70) {
      recommendations.push("🎯 Improve SEO: Use better titles (30-60 chars), add timestamps to descriptions, and use 8-15 relevant tags per video");
    }
    
    if (metrics.uploadConsistency < 70) {
      recommendations.push("📅 Upload Consistency: Establish a regular posting schedule (weekly/bi-weekly) to improve audience retention");
    }
    
    if (metrics.brandingScore < 80) {
      recommendations.push("🎨 Channel Branding: Add a professional banner, optimize channel description, and ensure consistent visual identity");
    }
    
    if (metrics.playlistCount < 3) {
      recommendations.push("📚 Create Playlists: Organize content into 5+ playlists to increase session duration and improve discoverability");
    }
    
    if (metrics.avgEngagement < 3) {
      recommendations.push("💬 Boost Engagement: Ask questions in videos, respond to comments, and add clear calls-to-action");
    }
    
    return recommendations;
  }

  identifyStrengths(seoScore, uploadConsistency, brandingScore, engagement) {
    const strengths = [];
    if (seoScore >= 80) strengths.push("Excellent SEO optimization");
    if (uploadConsistency >= 80) strengths.push("Consistent upload schedule");
    if (brandingScore >= 80) strengths.push("Strong channel branding");
    if (engagement >= 4) strengths.push("High audience engagement");
    return strengths.length > 0 ? strengths : ["Room for improvement in all areas"];
  }

  identifyImprovements(seoScore, uploadConsistency, brandingScore, engagement) {
    const improvements = [];
    if (seoScore < 70) improvements.push("SEO optimization needed");
    if (uploadConsistency < 70) improvements.push("More consistent uploads required");
    if (brandingScore < 70) improvements.push("Channel branding needs work");
    if (engagement < 3) improvements.push("Focus on audience engagement");
    return improvements;
  }

  async writeToSheets(analysis) {
    console.log('📝 Writing results to Google Sheets...');
    
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.log('⚠️ No Google Sheet ID provided, skipping sheet update');
      return;
    }

    try {
      // Clear existing data and write new analysis
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'A1:Z1000'
      });

      const values = [
        ['🎥 YouTube Channel Analysis Report', '', '', ''],
        ['Generated:', new Date().toLocaleString(), '', ''],
        ['', '', '', ''],
        ['📊 CHANNEL OVERVIEW', '', '', ''],
        ['Channel Name', analysis.channel.name, '', ''],
        ['Subscribers', analysis.channel.subscriberCount.toLocaleString(), '', ''],
        ['Total Views', analysis.channel.totalViews.toLocaleString(), '', ''],
        ['Video Count', analysis.channel.videoCount, '', ''],
        ['', '', '', ''],
        ['📈 KEY METRICS', '', '', ''],
        ['Average Views per Video', analysis.metrics.avgViews.toLocaleString(), '', ''],
        ['Average Engagement Rate', `${analysis.metrics.avgEngagement}%`, '', ''],
        ['SEO Score', `${analysis.metrics.seoScore}/100`, '', ''],
        ['Upload Consistency', `${analysis.metrics.uploadConsistency}%`, '', ''],
        ['Branding Score', `${analysis.metrics.brandingScore}/100`, '', ''],
        ['Playlist Count', analysis.metrics.playlistCount, '', ''],
        ['', '', '', ''],
        ['🎯 RECOMMENDATIONS', '', '', ''],
        ...analysis.recommendations.map(rec => [rec, '', '', '']),
        ['', '', '', ''],
        ['💪 STRENGTHS', '', '', ''],
        ...analysis.analysis.strengths.map(strength => [strength, '', '', '']),
        ['', '', '', ''],
        ['🔧 AREAS FOR IMPROVEMENT', '', '', ''],
        ...analysis.analysis.improvements.map(improvement => [improvement, '', '', '']),
        ['', '', '', ''],
        ['📹 RECENT VIDEOS ANALYSIS', '', '', ''],
        ['Title', 'Views', 'Engagement %', 'Published'],
        ...analysis.videos.map(video => [
          video.title,
          video.views.toLocaleString(),
          `${video.engagementRate.toFixed(2)}%`,
          new Date(video.publishedAt).toLocaleDateString()
        ])
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log('✅ Results written to Google Sheets successfully!');
    } catch (error) {
      console.error('❌ Failed to write to Google Sheets:', error.message);
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
    console.log('🎉 Analysis completed successfully!');
  } catch (error) {
    console.error('💥 Analysis failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = YouTubeChannelAnalyzer;
