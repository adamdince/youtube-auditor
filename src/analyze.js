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
    console.log('🔍 Performing comprehensive channel analysis...');
    
    const { channel, videos, playlists } = data;
    const stats = channel.statistics;
    const snippet = channel.snippet;
    const brandingSettings = channel.brandingSettings || {};
    
    // Basic metrics
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViews = parseInt(stats.totalViews) || 0;
    const videoCount = parseInt(stats.videoCount) || 0;
    
    // Enhanced video analysis
    const videoAnalysis = videos.map(video => this.analyzeVideoComprehensive(video));
    const avgViews = videoAnalysis.reduce((sum, v) => sum + v.views, 0) / videoAnalysis.length || 0;
    const avgEngagement = videoAnalysis.reduce((sum, v) => sum + v.engagementRate, 0) / videoAnalysis.length || 0;
    
    // 1. CHANNEL BRANDING & IDENTITY ANALYSIS
    const brandingAnalysis = this.analyzeBrandingComprehensive(channel, brandingSettings);
    
    // 2. CONTENT STRATEGY & CONSISTENCY ANALYSIS
    const contentStrategy = this.analyzeContentStrategyComprehensive(videoAnalysis, snippet);
    
    // 3. SEO & METADATA ANALYSIS (Per Video)
    const seoAnalysis = this.analyzeSEOComprehensive(videoAnalysis);
    
    // 4. ENGAGEMENT SIGNALS ANALYSIS
    const engagementSignals = this.analyzeEngagementSignalsComprehensive(videoAnalysis, subscriberCount);
    
    // 5. CONTENT QUALITY & WATCHABILITY ANALYSIS
    const contentQuality = this.analyzeContentQualityComprehensive(videoAnalysis);
    
    // 6. PLAYLISTS & CHANNEL STRUCTURE ANALYSIS
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
      // COMPREHENSIVE ANALYSIS RESULTS
      brandingIdentity: brandingAnalysis,
      contentStrategy: contentStrategy,
      seoMetadata: seoAnalysis,
      engagementSignals: engagementSignals,
      contentQuality: contentQuality,
      playlistStructure: playlistStructure,
      
      // SUMMARY METRICS
      overallScores: {
        brandingScore: brandingAnalysis.overallScore,
        contentStrategyScore: contentStrategy.overallScore,
        seoScore: seoAnalysis.overallScore,
        engagementScore: engagementSignals.overallScore,
        contentQualityScore: contentQuality.overallScore,
        playlistScore: playlistStructure.overallScore
      },
      
      // TOP RECOMMENDATIONS
      priorityRecommendations: this.generatePriorityRecommendations({
        branding: brandingAnalysis,
        content: contentStrategy,
        seo: seoAnalysis,
        engagement: engagementSignals,
        quality: contentQuality,
        playlists: playlistStructure
      }),
      
      videos: videoAnalysis.slice(0, 15), // Top 15 for detailed analysis
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
    
    // Comprehensive video analysis
    const title = snippet.title;
    const description = snippet.description || '';
    const tags = snippet.tags || [];
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
      
      // DETAILED SEO ANALYSIS
      titleAnalysis: this.analyzeTitleComprehensive(title),
      descriptionAnalysis: this.analyzeDescriptionComprehensive(description),
      tagsAnalysis: this.analyzeTagsComprehensive(tags),
      thumbnailAnalysis: this.analyzeThumbnailComprehensive(snippet.thumbnails),
      
      // CONTENT QUALITY INDICATORS
      hasHook: this.detectHook(title, description),
      hasTimestamps: this.detectTimestamps(description),
      hasCallToAction: this.detectCallToAction(description),
      hasLinks: this.detectLinks(description),
      contentStructure: this.analyzeContentStructure(description),
      
      // ENGAGEMENT QUALITY
      likeToViewRatio: views > 0 ? (likes / views) * 100 : 0,
      commentToViewRatio: views > 0 ? (comments / views) * 100 : 0,
      
      // VIDEO FORMAT CLASSIFICATION
      format: this.classifyVideoFormat(duration, title)
    };
  }

  // 1. CHANNEL BRANDING & IDENTITY ANALYSIS
  analyzeBrandingComprehensive(channel, brandingSettings) {
    const snippet = channel.snippet;
    const stats = channel.statistics;
    
    // Channel Name Analysis
    const channelNameAnalysis = {
      clarity: this.analyzeChannelNameClarity(snippet.title),
      memorability: this.analyzeChannelNameMemorability(snippet.title),
      nicheAlignment: this.analyzeChannelNameNiche(snippet.title, snippet.description)
    };
    
    // Profile Image & Banner Analysis
    const visualIdentity = {
      profileImageQuality: snippet.thumbnails?.high ? 85 : 45,
      bannerPresent: !!brandingSettings.image?.bannerExternalUrl,
      bannerQuality: brandingSettings.image?.bannerExternalUrl ? 80 : 30,
      visualConsistency: this.analyzeVisualConsistency(snippet.thumbnails, brandingSettings)
    };
    
    // About Section Analysis
    const aboutSection = {
      descriptionLength: snippet.description?.length || 0,
      keywordOptimized: this.analyzeDescriptionKeywords(snippet.description),
      valueProposition: this.analyzeValueProposition(snippet.description),
      hasWebsiteLinks: this.detectWebsiteLinks(snippet.description),
      hasSocialLinks: this.detectSocialLinks(snippet.description),
      hasContactInfo: this.detectContactInfo(snippet.description),
      uploadScheduleMentioned: this.detectUploadSchedule(snippet.description)
    };
    
    const overallScore = (
      (channelNameAnalysis.clarity + channelNameAnalysis.memorability + channelNameAnalysis.nicheAlignment) / 3 * 0.25 +
      (visualIdentity.profileImageQuality + visualIdentity.bannerQuality) / 2 * 0.25 +
      this.calculateAboutSectionScore(aboutSection) * 0.50
    );
    
    return {
      overallScore,
      channelName: channelNameAnalysis,
      visualIdentity,
      aboutSection,
      recommendations: this.generateBrandingRecommendations(channelNameAnalysis, visualIdentity, aboutSection)
    };
  }

  // 2. CONTENT STRATEGY & CONSISTENCY ANALYSIS
  analyzeContentStrategyComprehensive(videos, channelSnippet) {
    // Upload Frequency & Consistency
    const uploadAnalysis = this.analyzeUploadPattern(videos);
    
    // Content Themes Analysis
    const themeAnalysis = this.analyzeContentThemes(videos);
    
    // Video Formats Analysis
    const formatAnalysis = this.analyzeVideoFormats(videos);
    
    // Target Audience Analysis
    const audienceAnalysis = this.analyzeTargetAudience(videos, channelSnippet);
    
    const overallScore = (
      uploadAnalysis.consistencyScore * 0.3 +
      themeAnalysis.clarityScore * 0.25 +
      formatAnalysis.diversityScore * 0.25 +
      audienceAnalysis.clarityScore * 0.2
    );
    
    return {
      overallScore,
      uploadPattern: uploadAnalysis,
      contentThemes: themeAnalysis,
      videoFormats: formatAnalysis,
      targetAudience: audienceAnalysis,
      recommendations: this.generateContentStrategyRecommendations(uploadAnalysis, themeAnalysis, formatAnalysis, audienceAnalysis)
    };
  }

  // 3. SEO & METADATA ANALYSIS
  analyzeSEOComprehensive(videos) {
    const titleAnalysis = this.analyzeTitlesComprehensive(videos);
    const descriptionAnalysis = this.analyzeDescriptionsComprehensive(videos);
    const tagsAnalysis = this.analyzeTagsSetComprehensive(videos);
    const thumbnailAnalysis = this.analyzeThumbnailsComprehensive(videos);
    
    const overallScore = (
      titleAnalysis.averageScore * 0.3 +
      descriptionAnalysis.averageScore * 0.3 +
      tagsAnalysis.averageScore * 0.2 +
      thumbnailAnalysis.averageScore * 0.2
    );
    
    return {
      overallScore,
      titles: titleAnalysis,
      descriptions: descriptionAnalysis,
      tags: tagsAnalysis,
      thumbnails: thumbnailAnalysis,
      recommendations: this.generateSEORecommendations(titleAnalysis, descriptionAnalysis, tagsAnalysis, thumbnailAnalysis)
    };
  }

  // 4. ENGAGEMENT SIGNALS ANALYSIS
  analyzeEngagementSignalsComprehensive(videos, subscriberCount) {
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const avgViews = totalViews / videos.length;
    
    // Views-to-Subscribers Ratio
    const viewsToSubsRatio = (avgViews / subscriberCount) * 100;
    const viewsToSubsScore = Math.min(viewsToSubsRatio * 10, 100); // 10% = 100 points
    
    // Like-to-View Ratio Analysis
    const likeRatios = videos.map(v => v.likeToViewRatio);
    const avgLikeRatio = likeRatios.reduce((sum, r) => sum + r, 0) / likeRatios.length;
    const likeRatioScore = Math.min(avgLikeRatio * 25, 100); // 4% = 100 points
    
    // Comment Quality Analysis
    const commentAnalysis = this.analyzeCommentQuality(videos);
    
    // Engagement Consistency
    const engagementConsistency = this.analyzeEngagementConsistency(videos);
    
    const overallScore = (
      viewsToSubsScore * 0.3 +
      likeRatioScore * 0.25 +
      commentAnalysis.qualityScore * 0.25 +
      engagementConsistency * 0.2
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
      consistency: engagementConsistency,
      recommendations: this.generateEngagementRecommendations(viewsToSubsScore, likeRatioScore, commentAnalysis)
    };
  }

  // 5. CONTENT QUALITY & WATCHABILITY ANALYSIS
  analyzeContentQualityComprehensive(videos) {
    // Hook Analysis (First 10-15 seconds indicators)
    const hookAnalysis = this.analyzeHooks(videos);
    
    // Structure Analysis
    const structureAnalysis = this.analyzeContentStructure(videos);
    
    // Call to Action Analysis
    const ctaAnalysis = this.analyzeCallsToAction(videos);
    
    // Professional Quality Indicators
    const professionalQuality = this.analyzeProfessionalQuality(videos);
    
    const overallScore = (
      hookAnalysis.score * 0.3 +
      structureAnalysis.score * 0.25 +
      ctaAnalysis.score * 0.25 +
      professionalQuality.score * 0.2
    );
    
    return {
      overallScore,
      hooks: hookAnalysis,
      structure: structureAnalysis,
      callsToAction: ctaAnalysis,
      professionalQuality,
      recommendations: this.generateContentQualityRecommendations(hookAnalysis, structureAnalysis, ctaAnalysis, professionalQuality)
    };
  }

  // 6. PLAYLISTS & CHANNEL STRUCTURE ANALYSIS
  analyzePlaylistStructureComprehensive(playlists, videos) {
    if (!playlists || playlists.length === 0) {
      return {
        overallScore: 15,
        organization: { score: 0, hasPlaylists: false },
        bingeWatching: { score: 0, potential: 'Low' },
        thematicGrouping: { score: 0, themes: [] },
        recommendations: [{
          priority: 'High',
          category: 'Playlist Creation',
          action: 'Create 5+ playlists to organize your content by topic and increase session duration'
        }]
      };
    }
    
    // Playlist Organization Analysis
    const organizationAnalysis = this.analyzePlaylistOrganization(playlists);
    
    // Binge-Watching Potential
    const bingeAnalysis = this.analyzeBingeWatchingPotential(playlists);
    
    // Thematic Grouping
    const thematicAnalysis = this.analyzeThematicGrouping(playlists, videos);
    
    const overallScore = (
      organizationAnalysis.score * 0.4 +
      bingeAnalysis.score * 0.35 +
      thematicAnalysis.score * 0.25
    );
    
    return {
      overallScore,
      organization: organizationAnalysis,
      bingeWatching: bingeAnalysis,
      thematicGrouping: thematicAnalysis,
      recommendations: this.generatePlaylistRecommendations(organizationAnalysis, bingeAnalysis, thematicAnalysis)
    };
  }

  // HELPER FUNCTIONS FOR COMPREHENSIVE ANALYSIS

  // Duration Parser
  parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  // CHANNEL BRANDING ANALYSIS HELPERS
  analyzeChannelNameClarity(name) {
    let score = 50;
    if (name.length >= 5 && name.length <= 25) score += 25; // Good length
    if (!name.includes('Official') && !name.includes('TV')) score += 15; // Avoid generic terms
    if (name.split(' ').length <= 3) score += 10; // Memorable
    return Math.min(score, 100);
  }

  analyzeChannelNameMemorability(name) {
    let score = 50;
    if (name.length <= 20) score += 20; // Short is memorable
    if (!/\d{4,}/.test(name)) score += 15; // No long numbers
    if (!name.includes('_') && !name.includes('-')) score += 15; // Clean
    return Math.min(score, 100);
  }

  analyzeChannelNameNiche(name, description) {
    const techWords = ['tech', 'code', 'dev', 'program', 'tutorial', 'learn'];
    const nameWords = name.toLowerCase().split(' ');
    const descWords = (description || '').toLowerCase().split(' ');
    
    let score = 60;
    if (techWords.some(word => nameWords.some(n => n.includes(word)))) score += 20;
    if (techWords.some(word => descWords.some(d => d.includes(word)))) score += 20;
    return Math.min(score, 100);
  }

  analyzeVisualConsistency(thumbnails, brandingSettings) {
    let score = 40;
    if (thumbnails?.high) score += 30;
    if (brandingSettings.image?.bannerExternalUrl) score += 30;
    return Math.min(score, 100);
  }

  analyzeDescriptionKeywords(description) {
    if (!description) return 0;
    const keywords = ['tutorial', 'learn', 'guide', 'tips', 'how to', 'beginner', 'advanced'];
    const hasKeywords = keywords.some(keyword => description.toLowerCase().includes(keyword));
    return hasKeywords ? 80 : 30;
  }

  analyzeValueProposition(description) {
    if (!description) return 0;
    const propositions = ['learn', 'master', 'become', 'improve', 'discover', 'unlock'];
    const hasProposition = propositions.some(prop => description.toLowerCase().includes(prop));
    return hasProposition ? 85 : 40;
  }

  detectWebsiteLinks(description) {
    if (!description) return false;
    return /https?:\/\/[^\s]+\.(com|org|net|io|dev)/.test(description);
  }

  detectSocialLinks(description) {
    if (!description) return false;
    const socialPlatforms = ['twitter', 'instagram', 'tiktok', 'linkedin', 'discord'];
    return socialPlatforms.some(platform => description.toLowerCase().includes(platform));
  }

  detectContactInfo(description) {
    if (!description) return false;
    return description.toLowerCase().includes('contact') || description.includes('@');
  }

  detectUploadSchedule(description) {
    if (!description) return false;
    const scheduleWords = ['every', 'weekly', 'daily', 'monday', 'tuesday', 'upload'];
    return scheduleWords.some(word => description.toLowerCase().includes(word));
  }

  calculateAboutSectionScore(aboutSection) {
    let score = 0;
    if (aboutSection.descriptionLength >= 200) score += 20;
    if (aboutSection.keywordOptimized > 70) score += 20;
    if (aboutSection.valueProposition > 70) score += 15;
    if (aboutSection.hasWebsiteLinks) score += 15;
    if (aboutSection.hasSocialLinks) score += 10;
    if (aboutSection.hasContactInfo) score += 10;
    if (aboutSection.uploadScheduleMentioned) score += 10;
    return Math.min(score, 100);
  }

  // CONTENT STRATEGY ANALYSIS HELPERS
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
    
    let frequency = 'Irregular';
    if (avgInterval <= 2) frequency = 'Daily';
    else if (avgInterval <= 4) frequency = 'Every 2-3 days';
    else if (avgInterval <= 8) frequency = 'Weekly';
    else if (avgInterval <= 15) frequency = 'Bi-weekly';
    
    return {
      consistencyScore,
      frequency,
      averageDaysBetween: avgInterval,
      lastUpload: dates[0].toISOString().split('T')[0]
    };
  }

  analyzeContentThemes(videos) {
    const allTags = videos.flatMap(v => v.tags);
    const tagFreq = {};
    
    allTags.forEach(tag => {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    });
    
    const topThemes = Object.entries(tagFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([tag, count]) => ({ theme: tag, frequency: count }));
    
    const clarityScore = topThemes.length >= 3 ? 85 : topThemes.length >= 1 ? 60 : 30;
    
    return {
      clarityScore,
      primaryThemes: topThemes.slice(0, 5),
      themeConsistency: this.calculateThemeConsistency(topThemes),
      focusRecommendation: topThemes.length > 6 ? 'Narrow focus to 3-5 core themes' : 'Good thematic focus'
    };
  }

  calculateThemeConsistency(themes) {
    if (themes.length === 0) return 0;
    const total = themes.reduce((sum, t) => sum + t.frequency, 0);
    const topThemeFreq = themes[0]?.frequency || 0;
    return (topThemeFreq / total) * 100;
  }

  analyzeVideoFormats(videos) {
    const formats = { shorts: 0, medium: 0, long: 0, streams: 0 };
    
    videos.forEach(video => {
      if (video.duration < 60) formats.shorts++;
      else if (video.duration < 600) formats.medium++;
      else if (video.duration < 3600) formats.long++;
      else formats.streams++;
    });
    
    const total = videos.length;
    const percentages = {
      shorts: (formats.shorts / total) * 100,
      medium: (formats.medium / total) * 100,
      long: (formats.long / total) * 100,
      streams: (formats.streams / total) * 100
    };
    
    const diversityScore = Object.values(formats).filter(count => count > 0).length * 25;
    
    return {
      diversityScore: Math.min(diversityScore, 100),
      distribution: percentages,
      recommendations: this.getFormatRecommendations(percentages)
    };
  }

  getFormatRecommendations(percentages) {
    const recommendations = [];
    if (percentages.shorts < 20) {
      recommendations.push('Consider adding YouTube Shorts for increased discoverability');
    }
    if (percentages.long > 80) {
      recommendations.push('Mix in some shorter content for variety');
    }
    if (percentages.medium < 30) {
      recommendations.push('Medium-length videos (5-10 min) often perform well');
    }
    return recommendations;
  }

  analyzeTargetAudience(videos, channelSnippet) {
    // Analyze titles and descriptions for audience indicators
    const allText = videos.map(v => v.title + ' ' + v.description).join(' ').toLowerCase();
    
    const audienceIndicators = {
      beginner: ['beginner', 'start', 'intro', 'basics', 'first', 'learn'],
      intermediate: ['intermediate', 'improve', 'better', 'advance', 'next level'],
      advanced: ['advanced', 'expert', 'master', 'pro', 'deep dive'],
      professional: ['professional', 'business', 'enterprise', 'production']
    };
    
    let clarityScore = 40;
    let primaryAudience = 'Mixed';
    
    Object.entries(audienceIndicators).forEach(([level, keywords]) => {
      const matches = keywords.filter(keyword => allText.includes(keyword)).length;
      if (matches > 3) {
        clarityScore += 15;
        if (matches > 5) primaryAudience = level;
      }
    });
    
    return {
      clarityScore: Math.min(clarityScore, 100),
      primaryAudience,
      audienceIndicators: this.countAudienceIndicators(allText, audienceIndicators)
    };
  }

  countAudienceIndicators(text, indicators) {
    const counts = {};
    Object.entries(indicators).forEach(([level, keywords]) => {
      counts[level] = keywords.filter(keyword => text.includes(keyword)).length;
    });
    return counts;
  }

  // SEO ANALYSIS HELPERS
  analyzeTitleComprehensive(title) {
    let score = 0;
    
    // Length optimization
    if (title.length >= 30 && title.length <= 60) score += 25;
    else if (title.length > 60) score += 15;
    else score += 10;
    
    // Keyword placement
    const words = title.toLowerCase().split(' ');
    if (words.length >= 5) score += 20;
    
    // Power words
    const powerWords = ['ultimate', 'complete', 'best', 'guide', 'tutorial', 'how to', 'tips', 'secrets'];
    if (powerWords.some(word => title.toLowerCase().includes(word))) score += 20;
    
    // Numbers
    if (/\d/.test(title)) score += 15;
    
    // Questions
    if (title.includes('?')) score += 10;
    
    // Natural language
    if (title.toLowerCase().includes('how to') || title.toLowerCase().includes('what is')) score += 10;
    
    return {
      score: Math.min(score, 100),
      length: title.length,
      hasNumbers: /\d/.test(title),
      hasPowerWords: powerWords.some(word => title.toLowerCase().includes(word)),
      isQuestion: title.includes('?'),
      naturalLanguage: title.toLowerCase().includes('how to') || title.toLowerCase().includes('what is')
    };
  }

  analyzeDescriptionComprehensive(description) {
    if (!description) return { score: 0, issues: ['No description provided'] };
    
    let score = 0;
    const issues = [];
    const strengths = [];
    
    // Length
    if (description.length >= 200) {
      score += 25;
      strengths.push('Good description length');
    } else {
      issues.push('Description too short (aim for 200+ characters)');
    }
    
    // Links
    if (description.includes('http')) {
      score += 15;
      strengths.push('Contains links');
    } else {
      issues.push('No links to additional resources');
    }
    
    // Structure
    if (description.includes('\n')) {
      score += 15;
      strengths.push('Well-structured with line breaks');
    }
    
    // Timestamps
    if (/\d+:\d+/.test(description)) {
      score += 20;
      strengths.push('Includes timestamps');
    } else {
      issues.push('No timestamps for navigation');
    }
    
    // Call to action
    const cta = ['subscribe', 'like', 'comment', 'share', 'bell'];
    if (cta.some(word => description.toLowerCase().includes(word))) {
      score += 15;
      strengths.push('Has call-to-action');
    } else {
      issues.push('Missing call-to-action');
    }
    
    // Social media
    if (description.includes('twitter') || description.includes('instagram')) {
      score += 10;
      strengths.push('Links to social media');
    }
    
    return {
      score: Math.min(score, 100),
      length: description.length,
      hasLinks: description.includes('http'),
      hasTimestamps: /\d+:\d+/.test(description),
      hasCallToAction: cta.some(word => description.toLowerCase().includes(word)),
      strengths,
      issues
    };
  }

  analyzeTagsComprehensive(tags) {
    if (!tags || tags.length === 0) {
      return { 
        score: 0, 
        count: 0, 
        issues: ['No tags provided'],
        recommendations: ['Add 8-15 relevant tags per video']
      };
    }
    
    let score = 0;
    const issues = [];
    const strengths = [];
    
    // Quantity
    if (tags.length >= 8 && tags.length <= 15) {
      score += 40;
      strengths.push('Good tag quantity');
    } else if (tags.length >= 5) {
      score += 25;
      issues.push('Could use more tags (aim for 8-15)');
    } else {
      issues.push('Too few tags (minimum 5 recommended)');
    }
    
    // Variety
    const shortTags = tags.filter(tag => tag.length <= 15).length;
    const longTags = tags.filter(tag => tag.length > 15).length;
    if (shortTags > 0 && longTags > 0) {
      score += 20;
      strengths.push('Good mix of short and long-tail tags');
    }
    
    // Specificity
    if (tags.some(tag => tag.includes(' '))) {
      score += 20;
      strengths.push('Includes long-tail keywords');
    }
    
    // Relevance indicators
    if (tags.some(tag => tag.length > 20)) {
      score += 20;
      strengths.push('Has specific/niche tags');
    }
    
    return {
      score: Math.min(score, 100),
      count: tags.length,
      hasVariety: shortTags > 0 && longTags > 0,
      hasLongTail: tags.some(tag => tag.includes(' ')),
      strengths,
      issues,
      recommendations: this.getTagRecommendations(tags.length)
    };
  }

  getTagRecommendations(tagCount) {
    if (tagCount === 0) return ['Add relevant tags to improve discoverability'];
    if (tagCount < 5) return ['Add more tags (aim for 8-15 total)'];
    if (tagCount > 15) return ['Too many tags may dilute relevance'];
    return ['Good tag count - ensure they are all relevant'];
  }

  analyzeThumbnailComprehensive(thumbnails) {
    if (!thumbnails) return { score: 30, issues: ['No thumbnail data available'] };
    
    let score = 60; // Base score for having thumbnails
    const strengths = [];
    
    if (thumbnails.high) {
      score += 20;
      strengths.push('High resolution available');
    }
    
    if (thumbnails.maxres) {
      score += 20;
      strengths.push('Maximum resolution available');
    }
    
    return {
      score: Math.min(score, 100),
      hasHighRes: !!thumbnails.high,
      hasMaxRes: !!thumbnails.maxres,
      strengths,
      recommendations: ['Consider custom thumbnails for better click-through rates']
    };
  }

  // CONTENT QUALITY HELPERS
  detectHook(title, description) {
    const hookWords = ['ultimate', 'secret', 'mistake', 'never', 'always', 'best', 'worst', 'shocking'];
    const titleHook = hookWords.some(word => title.toLowerCase().includes(word));
    const descHook = description.toLowerCase().includes('in this video') || description.toLowerCase().includes('today we');
    return titleHook || descHook;
  }

  detectTimestamps(description) {
    return /\d+:\d+/.test(description) && description.includes('\n');
  }

  detectCallToAction(description) {
    const cta = ['subscribe', 'like', 'comment', 'share', 'bell', 'notification'];
    return cta.some(word => description.toLowerCase().includes(word));
  }

  detectLinks(description) {
    return /https?:\/\/[^\s]+/.test(description);
  }

  classifyVideoFormat(duration, title) {
    if (duration < 60) return 'Short';
    if (duration < 300) return 'Quick Tutorial';
    if (duration < 1200) return 'Standard';
    if (duration < 3600) return 'Long-form';
    return 'Extended/Stream';
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
    console.log('📝 Writing comprehensive results to Google Sheets...');
    
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.log('⚠️ No Google Sheet ID provided, skipping sheet update');
      return;
    }

    try {
      // Clear existing data and write comprehensive analysis
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'A1:Z1000'
      });

      const values = [
        ['🎥 COMPREHENSIVE YOUTUBE CHANNEL ANALYSIS', '', '', '', ''],
        ['Generated:', new Date().toLocaleString(), '', '', ''],
        ['', '', '', '', ''],
        
        // CHANNEL OVERVIEW
        ['📊 CHANNEL OVERVIEW', '', '', '', ''],
        ['Channel Name', analysis.channel.name, '', '', ''],
        ['Subscribers', analysis.channel.subscriberCount.toLocaleString(), '', '', ''],
        ['Total Views', analysis.channel.totalViews.toLocaleString(), '', '', ''],
        ['Video Count', analysis.channel.videoCount, '', '', ''],
        ['Channel Age', Math.floor((Date.now() - new Date(analysis.channel.createdAt)) / (1000 * 60 * 60 * 24 * 365)) + ' years', '', '', ''],
        ['Country', analysis.channel.country || 'Not specified', '', '', ''],
        ['', '', '', '', ''],
        
        // OVERALL SCORES DASHBOARD
        ['📈 OVERALL PERFORMANCE SCORES', '', '', '', ''],
        ['Branding & Identity', `${analysis.overallScores.brandingScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.brandingScore), '', ''],
        ['Content Strategy', `${analysis.overallScores.contentStrategyScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.contentStrategyScore), '', ''],
        ['SEO & Metadata', `${analysis.overallScores.seoScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.seoScore), '', ''],
        ['Engagement Signals', `${analysis.overallScores.engagementScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.engagementScore), '', ''],
        ['Content Quality', `${analysis.overallScores.contentQualityScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.contentQualityScore), '', ''],
        ['Playlist Structure', `${analysis.overallScores.playlistScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.playlistScore), '', ''],
        ['', '', '', '', ''],
        
        // 1. BRANDING & IDENTITY ANALYSIS
        ['🎨 1. CHANNEL BRANDING & IDENTITY', '', '', '', ''],
        ['Channel Name Clarity', `${analysis.brandingIdentity.channelName.clarity}/100`, '', '', ''],
        ['Channel Name Memorability', `${analysis.brandingIdentity.channelName.memorability}/100`, '', '', ''],
        ['Niche Alignment', `${analysis.brandingIdentity.channelName.nicheAlignment}/100`, '', '', ''],
        ['Profile Image Quality', `${analysis.brandingIdentity.visualIdentity.profileImageQuality}/100`, '', '', ''],
        ['Banner Quality', `${analysis.brandingIdentity.visualIdentity.bannerQuality}/100`, '', '', ''],
        ['About Section Score', `${analysis.brandingIdentity.aboutSection.descriptionLength} characters`, '', '', ''],
        ['Has Website Links', analysis.brandingIdentity.aboutSection.hasWebsiteLinks ? '✅ Yes' : '❌ No', '', '', ''],
        ['Has Social Links', analysis.brandingIdentity.aboutSection.hasSocialLinks ? '✅ Yes' : '❌ No', '', '', ''],
        ['Upload Schedule Mentioned', analysis.brandingIdentity.aboutSection.uploadScheduleMentioned ? '✅ Yes' : '❌ No', '', '', ''],
        ['', '', '', '', ''],
        
        // 2. CONTENT STRATEGY & CONSISTENCY
        ['📅 2. CONTENT STRATEGY & CONSISTENCY', '', '', '', ''],
        ['Upload Frequency', analysis.contentStrategy.uploadPattern.frequency, '', '', ''],
        ['Upload Consistency', `${analysis.contentStrategy.uploadPattern.consistencyScore.toFixed(1)}%`, '', '', ''],
        ['Average Days Between Uploads', analysis.contentStrategy.uploadPattern.averageDaysBetween.toFixed(1), '', '', ''],
        ['Last Upload', analysis.contentStrategy.uploadPattern.lastUpload, '', '', ''],
        ['Primary Content Themes', analysis.contentStrategy.contentThemes.primaryThemes.slice(0, 3).map(t => t.theme).join(', '), '', '', ''],
        ['Theme Consistency', `${analysis.contentStrategy.contentThemes.themeConsistency.toFixed(1)}%`, '', '', ''],
        ['', '', '', '', ''],
        ['Video Format Distribution:', '', '', '', ''],
        ['Shorts (<1 min)', `${analysis.contentStrategy.videoFormats.distribution.shorts.toFixed(1)}%`, '', '', ''],
        ['Medium (1-10 min)', `${analysis.contentStrategy.videoFormats.distribution.medium.toFixed(1)}%`, '', '', ''],
        ['Long-form (10+ min)', `${analysis.contentStrategy.videoFormats.distribution.long.toFixed(1)}%`, '', '', ''],
        ['Target Audience', analysis.contentStrategy.targetAudience.primaryAudience, '', '', ''],
        ['', '', '', '', ''],
        
        // 3. SEO & METADATA ANALYSIS
        ['🔍 3. SEO & METADATA ANALYSIS', '', '', '', ''],
        ['Overall SEO Score', `${analysis.seoMetadata.overallScore.toFixed(1)}/100`, '', '', ''],
        ['Title Optimization', `${analysis.seoMetadata.titles.averageScore.toFixed(1)}/100`, '', '', ''],
        ['Description Quality', `${analysis.seoMetadata.descriptions.averageScore.toFixed(1)}/100`, '', '', ''],
        ['Tags Effectiveness', `${analysis.seoMetadata.tags.averageScore.toFixed(1)}/100`, '', '', ''],
        ['Thumbnail Quality', `${analysis.seoMetadata.thumbnails.averageScore.toFixed(1)}/100`, '', '', ''],
        ['', '', '', '', ''],
        
        // 4. ENGAGEMENT SIGNALS
        ['💬 4. ENGAGEMENT SIGNALS', '', '', '', ''],
        ['Views-to-Subscribers Ratio', `${analysis.engagementSignals.viewsToSubscribers.ratio.toFixed(1)}%`, analysis.engagementSignals.viewsToSubscribers.benchmark, '', ''],
        ['Like-to-View Ratio', `${analysis.engagementSignals.likeEngagement.averageRatio.toFixed(2)}%`, analysis.engagementSignals.likeEngagement.benchmark, '', ''],
        ['Comment Engagement', `${analysis.engagementSignals.commentEngagement.qualityScore.toFixed(1)}/100`, '', '', ''],
        ['Engagement Consistency', `${analysis.engagementSignals.consistency.toFixed(1)}%`, '', '', ''],
        ['', '', '', '', ''],
        
        // 5. CONTENT QUALITY & WATCHABILITY
        ['🎬 5. CONTENT QUALITY & WATCHABILITY', '', '', '', ''],
        ['Hook Effectiveness', `${analysis.contentQuality.hooks.score.toFixed(1)}/100`, '', '', ''],
        ['Content Structure', `${analysis.contentQuality.structure.score.toFixed(1)}/100`, '', '', ''],
        ['Calls to Action', `${analysis.contentQuality.callsToAction.score.toFixed(1)}/100`, '', '', ''],
        ['Professional Quality', `${analysis.contentQuality.professionalQuality.score.toFixed(1)}/100`, '', '', ''],
        ['', '', '', '', ''],
        
        // 6. PLAYLIST STRUCTURE
        ['📚 6. PLAYLISTS & CHANNEL STRUCTURE', '', '', '', ''],
        ['Playlist Organization', `${analysis.playlistStructure.organization.score.toFixed(1)}/100`, '', '', ''],
        ['Binge-Watching Potential', analysis.playlistStructure.bingeWatching.potential, '', '', ''],
        ['Thematic Grouping', `${analysis.playlistStructure.thematicGrouping.score.toFixed(1)}/100`, '', '', ''],
        ['Total Playlists', analysis.playlistStructure.organization.hasPlaylists ? 
          analysis.playlistStructure.organization.playlistCount || 'Multiple' : '0', '', '', ''],
        ['', '', '', '', ''],
        
        // PRIORITY RECOMMENDATIONS
        ['🎯 PRIORITY RECOMMENDATIONS', '', '', '', ''],
        ...analysis.priorityRecommendations.slice(0, 10).map((rec, index) => [
          `${index + 1}. ${rec.category}`,
          rec.action,
          rec.priority,
          rec.impact || 'Medium',
          ''
        ]),
        ['', '', '', '', ''],
        
        // DETAILED VIDEO ANALYSIS
        ['📹 DETAILED VIDEO ANALYSIS (Recent 15 Videos)', '', '', '', ''],
        ['Title', 'Views', 'Engagement %', 'SEO Score', 'Format'],
        ...analysis.videos.slice(0, 15).map(video => [
          video.title.length > 50 ? video.title.substring(0, 47) + '...' : video.title,
          video.views.toLocaleString(),
          `${video.engagementRate.toFixed(2)}%`,
          `${((video.titleAnalysis.score + video.descriptionAnalysis.score + video.tagsAnalysis.score) / 3).toFixed(1)}/100`,
          video.format
        ]),
        ['', '', '', '', ''],
        
        // CONTENT THEMES BREAKDOWN
        ['🏷️ CONTENT THEMES BREAKDOWN', '', '', '', ''],
        ['Theme', 'Frequency', 'Percentage', '', ''],
        ...analysis.contentStrategy.contentThemes.primaryThemes.map(theme => [
          theme.theme,
          theme.frequency,
          `${((theme.frequency / analysis.videos.length) * 100).toFixed(1)}%`,
          '',
          ''
        ]),
        ['', '', '', '', ''],
        
        // COMPETITIVE INSIGHTS
        ['📊 PERFORMANCE BENCHMARKS', '', '', '', ''],
        ['Metric', 'Your Channel', 'Industry Benchmark', 'Status', ''],
        ['Upload Consistency', `${analysis.contentStrategy.uploadPattern.consistencyScore.toFixed(1)}%`, '80%+', 
          analysis.contentStrategy.uploadPattern.consistencyScore >= 80 ? '✅ Good' : '⚠️ Needs Improvement', ''],
        ['SEO Optimization', `${analysis.seoMetadata.overallScore.toFixed(1)}/100`, '75+', 
          analysis.seoMetadata.overallScore >= 75 ? '✅ Good' : '⚠️ Needs Improvement', ''],
        ['Engagement Rate', `${analysis.engagementSignals.overallScore.toFixed(1)}/100`, '70+', 
          analysis.engagementSignals.overallScore >= 70 ? '✅ Good' : '⚠️ Needs Improvement', ''],
        ['Content Quality', `${analysis.contentQuality.overallScore.toFixed(1)}/100`, '75+', 
          analysis.contentQuality.overallScore >= 75 ? '✅ Good' : '⚠️ Needs Improvement', ''],
        ['', '', '', '', ''],
        
        // NEXT STEPS
        ['🚀 RECOMMENDED NEXT STEPS', '', '', '', ''],
        ['Priority Level', 'Action Item', 'Expected Impact', 'Time Investment', ''],
        ...this.generateNextSteps(analysis).map(step => [
          step.priority,
          step.action,
          step.impact,
          step.timeInvestment,
          ''
        ]),
        ['', '', '', '', ''],
        
        // ANALYSIS METADATA
        ['📋 ANALYSIS METADATA', '', '', '', ''],
        ['Analysis Date', new Date(analysis.analysisDate).toLocaleDateString(), '', '', ''],
        ['Videos Analyzed', analysis.videos.length, '', '', ''],
        ['Data Sources', 'YouTube Data API v3, Channel Analytics', '', '', ''],
        ['Analysis Version', '2.0 Comprehensive', '', '', '']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log('✅ Comprehensive results written to Google Sheets successfully!');
    } catch (error) {
      console.error('❌ Failed to write to Google Sheets:', error.message);
    }
  }

  getScoreGrade(score) {
    if (score >= 90) return '🏆 Excellent';
    if (score >= 80) return '🥇 Very Good';
    if (score >= 70) return '🥈 Good';
    if (score >= 60) return '🥉 Fair';
    if (score >= 50) return '⚠️ Needs Improvement';
    return '❌ Poor';
  }

  generateNextSteps(analysis) {
    const steps = [];
    
    // High Priority Items
    if (analysis.overallScores.seoScore < 70) {
      steps.push({
        priority: 'HIGH',
        action: 'Optimize video titles and descriptions for SEO',
        impact: 'High - Better discoverability',
        timeInvestment: '30 min per video'
      });
    }
    
    if (analysis.contentStrategy.uploadPattern.consistencyScore < 70) {
      steps.push({
        priority: 'HIGH',
        action: 'Establish consistent upload schedule',
        impact: 'High - Audience retention',
        timeInvestment: '1 hour planning'
      });
    }
    
    if (analysis.overallScores.playlistScore < 50) {
      steps.push({
        priority: 'MEDIUM',
        action: 'Create 5+ organized playlists',
        impact: 'Medium - Session duration',
        timeInvestment: '2 hours setup'
      });
    }
    
    if (analysis.overallScores.brandingScore < 70) {
      steps.push({
        priority: 'MEDIUM',
        action: 'Update channel banner and about section',
        impact: 'Medium - Professional appearance',
        timeInvestment: '1 hour'
      });
    }
    
    if (analysis.overallScores.engagementScore < 60) {
      steps.push({
        priority: 'HIGH',
        action: 'Improve video hooks and calls-to-action',
        impact: 'High - Viewer engagement',
        timeInvestment: '15 min per video'
      });
    }
    
    return steps.slice(0, 8); // Top 8 recommendations
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
