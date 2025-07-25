// src/analyze.js - Conservative YouTube Channel Analyzer with Factual Insights
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
      playlists: playlistsResponse.data.items || []
    };
  }

  performAnalysis(data) {
    console.log('🔍 Performing comprehensive channel analysis...');
    
    const { channel, videos, playlists } = data;
    const stats = channel.statistics;
    const snippet = channel.snippet;
    const brandingSettings = channel.brandingSettings || {};
    
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViews = parseInt(stats.totalViews) || 0;
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
      titleAnalysis: this.analyzeTitleComprehensive(title),
      descriptionAnalysis: this.analyzeDescriptionComprehensive(description),
      tagsAnalysis: this.analyzeTagsComprehensive(tags),
      thumbnailAnalysis: this.analyzeThumbnailComprehensive(snippet.thumbnails),
      hasHook: this.detectHook(title, description),
      hasTimestamps: this.detectTimestamps(description),
      hasCallToAction: this.detectCallToAction(description),
      hasLinks: this.detectLinks(description),
      contentStructure: this.analyzeContentStructure(description),
      likeToViewRatio: views > 0 ? (likes / views) * 100 : 0,
      commentToViewRatio: views > 0 ? (comments / views) * 100 : 0,
      format: this.classifyVideoFormat(duration, title)
    };
  }

  // ENHANCED SEO ANALYSIS WITH FACTUAL INSIGHTS
  analyzeSEOComprehensive(videos) {
    const titleAnalysis = this.analyzeTitlesComprehensiveWithInsights(videos);
    const descriptionAnalysis = this.analyzeDescriptionsComprehensiveWithInsights(videos);
    const tagsAnalysis = this.analyzeTagsSetComprehensiveWithInsights(videos);
    const thumbnailAnalysis = this.analyzeThumbnailsComprehensive(videos);
    
    const overallScore = (
      titleAnalysis.averageScore * 0.3 +
      descriptionAnalysis.averageScore * 0.3 +
      tagsAnalysis.averageScore * 0.2 +
      thumbnailAnalysis.averageScore * 0.2
    );

    const seoInsights = this.generateSEOInsights(titleAnalysis, descriptionAnalysis, tagsAnalysis, videos);
    
    return {
      overallScore,
      scoreExplanation: this.explainSEOScore(overallScore, titleAnalysis, descriptionAnalysis, tagsAnalysis),
      titles: titleAnalysis,
      descriptions: descriptionAnalysis,
      tags: tagsAnalysis,
      thumbnails: thumbnailAnalysis,
      detailedInsights: seoInsights,
      recommendations: this.generateSEORecommendations(titleAnalysis, descriptionAnalysis, tagsAnalysis, thumbnailAnalysis)
    };
  }

  analyzeTitlesComprehensiveWithInsights(videos) {
    const titleScores = videos.map(video => this.analyzeTitleComprehensive(video.title));
    const averageScore = titleScores.reduce((sum, analysis) => sum + analysis.score, 0) / titleScores.length || 0;
    
    const avgLength = titleScores.reduce((sum, t) => sum + t.length, 0) / titleScores.length;
    const hasNumbersPercent = (titleScores.filter(t => t.hasNumbers).length / titleScores.length) * 100;
    const hasPowerWordsPercent = (titleScores.filter(t => t.hasPowerWords).length / titleScores.length) * 100;
    const isQuestionPercent = (titleScores.filter(t => t.isQuestion).length / titleScores.length) * 100;
    const optimalLengthPercent = (titleScores.filter(t => t.length >= 30 && t.length <= 60).length / titleScores.length) * 100;
    
    const highPerforming = videos.filter(v => v.views > (videos.reduce((sum, vid) => sum + vid.views, 0) / videos.length));
    const lowPerforming = videos.filter(v => v.views <= (videos.reduce((sum, vid) => sum + vid.views, 0) / videos.length));
    
    const bestTitleExample = videos.reduce((best, current) => 
      current.views > best.views ? current : best, videos[0]);
    const worstTitleExample = videos.reduce((worst, current) => 
      current.views < worst.views ? current : worst, videos[0]);
    
    return {
      averageScore,
      titleAnalyses: titleScores,
      averageLength: avgLength,
      optimalLengthPercentage: optimalLengthPercent,
      hasNumbersPercentage: hasNumbersPercent,
      hasPowerWordsPercentage: hasPowerWordsPercent,
      isQuestionPercentage: isQuestionPercent,
      bestPerformingTitle: {
        title: bestTitleExample.title,
        views: bestTitleExample.views,
        length: bestTitleExample.title.length,
        hasNumbers: /\d/.test(bestTitleExample.title)
      },
      worstPerformingTitle: {
        title: worstTitleExample.title,
        views: worstTitleExample.views,
        length: worstTitleExample.title.length,
        hasNumbers: /\d/.test(worstTitleExample.title)
      },
      patterns: this.identifyTitlePatterns(highPerforming, lowPerforming),
      specificIssues: this.identifyTitleIssues(titleScores),
      strengths: this.identifyTitleStrengths(titleScores),
      weaknesses: this.identifyTitleWeaknesses(titleScores)
    };
  }

  analyzeDescriptionsComprehensiveWithInsights(videos) {
    const descriptionScores = videos.map(video => this.analyzeDescriptionComprehensive(video.description));
    const averageScore = descriptionScores.reduce((sum, analysis) => sum + analysis.score, 0) / descriptionScores.length || 0;
    
    const avgLength = descriptionScores.reduce((sum, d) => sum + d.length, 0) / descriptionScores.length;
    const hasLinksPercent = (descriptionScores.filter(d => d.hasLinks).length / descriptionScores.length) * 100;
    const hasTimestampsPercent = (descriptionScores.filter(d => d.hasTimestamps).length / descriptionScores.length) * 100;
    const hasCTAPercent = (descriptionScores.filter(d => d.hasCallToAction).length / descriptionScores.length) * 100;
    const adequateLengthPercent = (descriptionScores.filter(d => d.length >= 200).length / descriptionScores.length) * 100;
    
    const bestDescription = videos.reduce((best, current) => 
      this.analyzeDescriptionComprehensive(current.description).score > 
      this.analyzeDescriptionComprehensive(best.description).score ? current : best, videos[0]);
    
    const emptyDescriptions = videos.filter(v => !v.description || v.description.length < 50);
    
    return {
      averageScore,
      descriptionAnalyses: descriptionScores,
      averageLength: avgLength,
      adequateLengthPercentage: adequateLengthPercent,
      hasLinksPercentage: hasLinksPercent,
      hasTimestampsPercentage: hasTimestampsPercent,
      hasCTAPercentage: hasCTAPercent,
      emptyDescriptionsCount: emptyDescriptions.length,
      bestExample: {
        title: bestDescription.title,
        descriptionLength: bestDescription.description?.length || 0,
        score: this.analyzeDescriptionComprehensive(bestDescription.description).score
      },
      specificIssues: this.identifyDescriptionIssues(descriptionScores, videos),
      strengths: this.identifyDescriptionStrengths(descriptionScores),
      weaknesses: this.identifyDescriptionWeaknesses(descriptionScores)
    };
  }

  analyzeTagsSetComprehensiveWithInsights(videos) {
    const tagScores = videos.map(video => this.analyzeTagsComprehensive(video.tags));
    const averageScore = tagScores.reduce((sum, analysis) => sum + analysis.score, 0) / tagScores.length || 0;
    
    const videosWithNoTags = videos.filter(v => !v.tags || v.tags.length === 0);
    const videosWithFewTags = videos.filter(v => v.tags && v.tags.length > 0 && v.tags.length < 5);
    const videosWithGoodTags = videos.filter(v => v.tags && v.tags.length >= 8 && v.tags.length <= 15);
    
    const avgTagCount = videos.reduce((sum, v) => sum + (v.tags?.length || 0), 0) / videos.length;
    
    const allTags = videos.flatMap(v => v.tags || []);
    const uniqueTags = [...new Set(allTags)];
    const tagFrequency = {};
    allTags.forEach(tag => {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    });
    
    const mostUsedTags = Object.entries(tagFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    
    return {
      averageScore,
      tagAnalyses: tagScores,
      averageTagCount: avgTagCount,
      videosWithNoTagsCount: videosWithNoTags.length,
      videosWithFewTagsCount: videosWithFewTags.length,
      videosWithGoodTagsCount: videosWithGoodTags.length,
      noTagsPercentage: (videosWithNoTags.length / videos.length) * 100,
      totalUniqueTagsUsed: uniqueTags.length,
      mostUsedTags: mostUsedTags,
      tagsExploration: this.explainTagsScore(averageScore, videosWithNoTags.length, avgTagCount),
      specificVideosNeedingTags: videosWithNoTags.slice(0, 5).map(v => ({
        title: v.title.substring(0, 50) + '...',
        views: v.views
      })),
      strengths: this.identifyTagStrengths(tagScores),
      weaknesses: this.identifyTagWeaknesses(tagScores)
    };
  }

  // FACTUAL SEO INSIGHTS GENERATOR
  generateSEOInsights(titleAnalysis, descriptionAnalysis, tagsAnalysis, videos) {
    const insights = [];
    
    if (titleAnalysis.averageLength < 30) {
      insights.push({
        category: "Title Length",
        severity: "High",
        finding: `${Math.round((titleAnalysis.titleAnalyses.filter(t => t.length < 30).length / videos.length) * 100)}% of your titles are under 30 characters`,
        impact: "Factual: Shorter titles have less space for descriptive keywords",
        example: `Shortest title: "${titleAnalysis.worstPerformingTitle.title}" (${titleAnalysis.worstPerformingTitle.length} chars)`,
        solution: "Consider extending titles to 40-60 characters with descriptive keywords"
      });
    }
    
    if (titleAnalysis.hasNumbersPercentage < 30) {
      insights.push({
        category: "Title Content",
        severity: "Medium",
        finding: `${Math.round(titleAnalysis.hasNumbersPercentage)}% of your titles include numbers`,
        impact: "Observation: Numbers can provide specific information to viewers",
        example: titleAnalysis.bestPerformingTitle.hasNumbers ? 
          `Your best performing video includes numbers: "${titleAnalysis.bestPerformingTitle.title}"` :
          "Your top performing videos don't use numbers in titles",
        solution: "Consider adding specific numbers, years, or quantities where relevant"
      });
    }
    
    if (descriptionAnalysis.averageLength < 150) {
      insights.push({
        category: "Description Length",
        severity: "High",
        finding: `Average description length is ${Math.round(descriptionAnalysis.averageLength)} characters`,
        impact: "Factual: Short descriptions provide limited context for viewers and search",
        example: `${descriptionAnalysis.emptyDescriptionsCount} videos have minimal descriptions (under 50 chars)`,
        solution: "Consider writing more detailed descriptions (200+ characters)"
      });
    }
    
    if (descriptionAnalysis.hasTimestampsPercentage < 20) {
      insights.push({
        category: "Video Navigation",
        severity: "Medium",
        finding: `${Math.round(descriptionAnalysis.hasTimestampsPercentage)}% of videos include timestamps`,
        impact: "Factual: Timestamps help viewers navigate longer content",
        example: "Most videos over 5 minutes could benefit from chapter markers",
        solution: "Add timestamps to descriptions for videos over 5 minutes"
      });
    }
    
    if (tagsAnalysis.noTagsPercentage > 10) {
      insights.push({
        category: "Tags Usage",
        severity: "Critical",
        finding: `${tagsAnalysis.videosWithNoTagsCount} out of ${videos.length} videos (${Math.round(tagsAnalysis.noTagsPercentage)}%) have zero tags`,
        impact: "Factual: Tags help YouTube understand video content for categorization",
        example: tagsAnalysis.specificVideosNeedingTags.length > 0 ?
          `Videos without tags: "${tagsAnalysis.specificVideosNeedingTags[0].title}"` :
          "Multiple recent videos missing tags entirely",
        solution: "Add relevant tags to videos that currently have none"
      });
    }
    
    return insights;
  }

  // ENHANCED ENGAGEMENT ANALYSIS WITH FACTUAL INSIGHTS
  analyzeEngagementSignalsComprehensive(videos, subscriberCount) {
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);
    const avgViews = totalViews / videos.length;
    
    const viewsToSubsRatio = (avgViews / subscriberCount) * 100;
    const viewsToSubsScore = Math.min(viewsToSubsRatio * 10, 100);
    
    const likeRatios = videos.map(v => v.likeToViewRatio);
    const avgLikeRatio = likeRatios.reduce((sum, r) => sum + r, 0) / likeRatios.length;
    const likeRatioScore = Math.min(avgLikeRatio * 25, 100);
    
    const commentAnalysis = this.analyzeCommentQuality(videos);
    const engagementConsistency = this.analyzeEngagementConsistency(videos);
    
    const overallScore = (
      viewsToSubsScore * 0.3 +
      likeRatioScore * 0.25 +
      commentAnalysis.qualityScore * 0.25 +
      engagementConsistency * 0.2
    );

    const engagementInsights = this.generateEngagementInsights(videos, avgViews, avgLikeRatio, subscriberCount);
    
    return {
      overallScore,
      scoreExplanation: this.explainEngagementScore(overallScore, viewsToSubsRatio, avgLikeRatio, commentAnalysis),
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
      detailedInsights: engagementInsights,
      recommendations: this.generateEngagementRecommendations(viewsToSubsScore, likeRatioScore, commentAnalysis)
    };
  }

  // FACTUAL ENGAGEMENT INSIGHTS GENERATOR
  generateEngagementInsights(videos, avgViews, avgLikeRatio, subscriberCount) {
    const insights = [];
    
    const viewsToSubsRatio = (avgViews / subscriberCount) * 100;
    if (viewsToSubsRatio < 5) {
      insights.push({
        category: "View Performance",
        severity: "High",
        finding: `Your videos average ${avgViews.toLocaleString()} views with ${subscriberCount.toLocaleString()} subscribers (${viewsToSubsRatio.toFixed(1)}% ratio)`,
        impact: "Observation: Low view-to-subscriber ratio indicates limited reach to existing audience",
        analysis: "Possible factors: notification settings, content timing, or audience interest",
        solution: "Consider reviewing video hooks, thumbnails, and posting schedule"
      });
    }
    
    if (avgLikeRatio < 1.5) {
      insights.push({
        category: "Like Engagement",
        severity: "Medium",
        finding: `Average like-to-view ratio is ${avgLikeRatio.toFixed(2)}% (typical range: 2-4%)`,
        impact: "Observation: Lower like rates compared to general benchmarks",
        analysis: this.analyzeLikePatterns(videos),
        solution: "Consider asking for engagement or reviewing content value proposition"
      });
    }
    
    const avgCommentRatio = videos.reduce((sum, v) => sum + v.commentToViewRatio, 0) / videos.length;
    if (avgCommentRatio < 0.3) {
      insights.push({
        category: "Comment Engagement",
        severity: "Medium",
        finding: `Comment rate is ${avgCommentRatio.toFixed(2)}% (typical range: 0.5-2%)`,
        impact: "Observation: Limited discussion generated by content",
        analysis: "Videos may lack conversation starters or community engagement",
        solution: "Consider ending videos with questions or discussion prompts"
      });
    }
    
    const viewCounts = videos.map(v => v.views);
    const maxViews = Math.max(...viewCounts);
    const minViews = Math.min(...viewCounts);
    const variation = ((maxViews - minViews) / avgViews) * 100;
    
    if (variation > 200) {
      const bestVideo = videos.find(v => v.views === maxViews);
      const worstVideo = videos.find(v => v.views === minViews);
      
      insights.push({
        category: "Performance Consistency",
        severity: "Medium",
        finding: `High variation in video performance: ${maxViews.toLocaleString()} views (best) vs ${minViews.toLocaleString()} views (worst)`,
        impact: "Observation: Inconsistent performance patterns detected",
        analysis: `Best: "${bestVideo.title.substring(0, 40)}..." vs Worst: "${worstVideo.title.substring(0, 40)}..."`,
        solution: "Review differences between top and bottom performing videos"
      });
    }
    
    return insights;
  }

  // ENHANCED CONTENT QUALITY ANALYSIS
  analyzeContentQualityComprehensive(videos) {
    const hookAnalysis = this.analyzeHooksWithInsights(videos);
    const structureAnalysis = this.analyzeContentStructureSetWithInsights(videos);
    const ctaAnalysis = this.analyzeCallsToActionWithInsights(videos);
    const professionalQuality = this.analyzeProfessionalQualityWithInsights(videos);
    
    const overallScore = (
      hookAnalysis.score * 0.3 +
      structureAnalysis.score * 0.25 +
      ctaAnalysis.score * 0.25 +
      professionalQuality.score * 0.2
    );
    
    return {
      overallScore,
      scoreExplanation: this.explainContentQualityScore(overallScore, hookAnalysis, structureAnalysis, ctaAnalysis),
      hooks: hookAnalysis,
      structure: structureAnalysis,
      callsToAction: ctaAnalysis,
      professionalQuality,
      recommendations: this.generateContentQualityRecommendations(hookAnalysis, structureAnalysis, ctaAnalysis, professionalQuality)
    };
  }

  analyzeHooksWithInsights(videos) {
    const hookAnalysis = videos.map(video => {
      const title = video.title.toLowerCase();
      const description = video.description.toLowerCase();
      
      const hookWords = ['ultimate', 'secret', 'mistake', 'never', 'always', 'best', 'worst', 'shocking', 'amazing', 'incredible'];
      const questionWords = ['how', 'what', 'why', 'when', 'where'];
      const urgencyWords = ['now', 'today', 'immediately', 'urgent', 'breaking'];
      
      let hookScore = 0;
      const hookElements = [];
      
      if (hookWords.some(word => title.includes(word))) {
        hookScore += 30;
        hookElements.push('power words');
      }
      if (questionWords.some(word => title.startsWith(word))) {
        hookScore += 25;
        hookElements.push('question format');
      }
      if (urgencyWords.some(word => title.includes(word))) {
        hookScore += 20;
        hookElements.push('urgency');
      }
      if (title.includes('?') || title.includes('!')) {
        hookScore += 15;
        hookElements.push('punctuation');
      }
      if (/\d/.test(title)) {
        hookScore += 10;
        hookElements.push('numbers');
      }
      
      return {
        videoTitle: video.title,
        score: Math.min(hookScore, 100),
        elements: hookElements,
        views: video.views
      };
    });
    
    const averageScore = hookAnalysis.reduce((sum, analysis) => sum + analysis.score, 0) / hookAnalysis.length || 0;
    const strongHooks = hookAnalysis.filter(h => h.score > 60);
    const weakHooks = hookAnalysis.filter(h => h.score < 30);
    
    const bestHook = hookAnalysis.reduce((best, current) => 
      current.score > best.score ? current : best, hookAnalysis[0]);
    const worstHook = hookAnalysis.reduce((worst, current) => 
      current.score < worst.score ? current : worst, hookAnalysis[0]);
    
    return {
      score: averageScore,
      videosWithStrongHooks: strongHooks.length,
      videosWithWeakHooks: weakHooks.length,
      averageHookScore: averageScore,
      bestExample: bestHook,
      worstExample: worstHook,
      hookInsights: this.generateHookInsights(hookAnalysis, videos),
      recommendations: this.generateHookRecommendations(averageScore, weakHooks.length, videos.length)
    };
  }

  // FACTUAL HOOK INSIGHTS GENERATOR
  generateHookInsights(hookAnalysis, videos) {
    const insights = [];
    
    const weakHooks = hookAnalysis.filter(h => h.score < 30);
    if (weakHooks.length > videos.length * 0.5) {
      insights.push({
        finding: `${weakHooks.length} out of ${videos.length} videos have low hook scores (under 30%)`,
        impact: "Observation: Most titles lack engaging elements like questions or specific details",
        pattern: "Common pattern: Titles tend to be descriptive rather than curiosity-generating",
        examples: weakHooks.slice(0, 3).map(h => `"${h.videoTitle.substring(0, 50)}..."`).join(', ')
      });
    }
    
    const noNumbers = hookAnalysis.filter(h => !h.elements.includes('numbers'));
    if (noNumbers.length > videos.length * 0.7) {
      insights.push({
        finding: `${noNumbers.length} videos don't use numbers in titles`,
        impact: "Observation: Numbers can provide specific, concrete information",
        pattern: "Titles focus on general concepts rather than specific quantities",
        examples: "Consider formats like: '5 Ways to...', '2024 Guide', 'Top 10...'"
      });
    }
    
    const noQuestions = hookAnalysis.filter(h => !h.elements.includes('question format'));
    if (noQuestions.length > videos.length * 0.8) {
      insights.push({
        finding: `${noQuestions.length} videos don't use question-based titles`,
        impact: "Observation: Question formats can create viewer curiosity",
        pattern: "Titles tend to make statements rather than pose questions",
        examples: "Consider formats like: 'Why Does...?', 'What Happens When...?', 'How To...?'"
      });
    }
    
    return insights;
  }

  // HELPER METHODS FOR COMPREHENSIVE ANALYSIS
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
    
    const powerWords = ['ultimate', 'complete', 'best', 'guide', 'tutorial', 'how to', 'tips', 'secrets'];
    if (powerWords.some(word => title.toLowerCase().includes(word))) score += 20;
    
    if (/\d/.test(title)) score += 15;
    if (title.includes('?')) score += 10;
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
    
    if (description.length >= 200) {
      score += 25;
      strengths.push('Good description length');
    } else {
      issues.push('Description too short (aim for 200+ characters)');
    }
    
    if (description.includes('http')) {
      score += 15;
      strengths.push('Contains links');
    } else {
      issues.push('No links to additional resources');
    }
    
    if (description.includes('\n')) {
      score += 15;
      strengths.push('Well-structured with line breaks');
    }
    
    if (/\d+:\d+/.test(description)) {
      score += 20;
      strengths.push('Includes timestamps');
    } else {
      issues.push('No timestamps for navigation');
    }
    
    const cta = ['subscribe', 'like', 'comment', 'share', 'bell'];
    if (cta.some(word => description.toLowerCase().includes(word))) {
      score += 15;
      strengths.push('Has call-to-action');
    } else {
      issues.push('Missing call-to-action');
    }
    
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
    
    if (tags.length >= 8 && tags.length <= 15) {
      score += 40;
      strengths.push('Good tag quantity');
    } else if (tags.length >= 5) {
      score += 25;
      issues.push('Could use more tags (aim for 8-15)');
    } else {
      issues.push('Too few tags (minimum 5 recommended)');
    }
    
    const shortTags = tags.filter(tag => tag.length <= 15).length;
    const longTags = tags.filter(tag => tag.length > 15).length;
    if (shortTags > 0 && longTags > 0) {
      score += 20;
      strengths.push('Good mix of short and long-tail tags');
    }
    
    if (tags.some(tag => tag.includes(' '))) {
      score += 20;
      strengths.push('Includes long-tail keywords');
    }
    
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
    
    let score = 60;
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

  analyzeContentStructure(description) {
    if (!description) return { score: 0, hasStructure: false };
    
    let score = 0;
    const hasLineBreaks = description.includes('\n');
    const hasSections = description.split('\n').length > 3;
    const hasTimestamps = /\d+:\d+/.test(description);
    const hasHeaders = /^[A-Z][^a-z]*:/.test(description);
    
    if (hasLineBreaks) score += 25;
    if (hasSections) score += 25;
    if (hasTimestamps) score += 30;
    if (hasHeaders) score += 20;
    
    return {
      score: Math.min(score, 100),
      hasStructure: score > 40,
      hasLineBreaks,
      hasSections,
      hasTimestamps,
      hasHeaders
    };
  }

  analyzeContentStructureSetWithInsights(videos) {
    const structureAnalysis = videos.map(video => this.analyzeContentStructure(video.description));
    const averageScore = structureAnalysis.reduce((sum, analysis) => sum + analysis.score, 0) / structureAnalysis.length || 0;
    
    return {
      score: averageScore,
      videosWithStructure: structureAnalysis.filter(analysis => analysis.hasStructure).length,
      videosWithTimestamps: structureAnalysis.filter(analysis => analysis.hasTimestamps).length
    };
  }

  analyzeCallsToActionWithInsights(videos) {
    const ctaAnalysis = videos.map(video => {
      const description = video.description.toLowerCase();
      
      const ctaWords = ['subscribe', 'like', 'comment', 'share', 'bell', 'notification', 'follow', 'join'];
      const foundCTAs = ctaWords.filter(word => description.includes(word));
      
      let score = foundCTAs.length * 15;
      if (description.includes('subscribe') && description.includes('bell')) score += 20;
      if (description.includes('comment below')) score += 10;
      if (description.includes('share') && description.includes('friends')) score += 10;
      
      return Math.min(score, 100);
    });
    
    const averageScore = ctaAnalysis.reduce((sum, score) => sum + score, 0) / ctaAnalysis.length || 0;
    
    return {
      score: averageScore,
      videosWithCTA: ctaAnalysis.filter(score => score > 30).length,
      averageCTAScore: averageScore,
      recommendations: averageScore < 50 ? ['Add clear calls-to-action in video descriptions'] : []
    };
  }

  analyzeProfessionalQualityWithInsights(videos) {
    const qualityAnalysis = videos.map(video => {
      let score = 50;
      
      const title = video.title;
      if (title.length >= 30 && title.length <= 60) score += 15;
      if (!/ALL CAPS/.test(title) && title !== title.toUpperCase()) score += 10;
      
      const description = video.description;
      if (description && description.length >= 200) score += 15;
      if (description && description.includes('http')) score += 5;
      
      if (video.tags && video.tags.length >= 5) score += 5;
      
      return Math.min(score, 100);
    });
    
    const averageScore = qualityAnalysis.reduce((sum, score) => sum + score, 0) / qualityAnalysis.length || 0;
    
    return {
      score: averageScore,
      indicators: {
        properTitleLength: qualityAnalysis.filter((_, i) => {
          const title = videos[i].title;
          return title.length >= 30 && title.length <= 60;
        }).length,
        adequateDescriptions: qualityAnalysis.filter((_, i) => {
          return videos[i].description && videos[i].description.length >= 200;
        }).length
      }
    };
  }

  // BRANDING AND STRATEGY ANALYSIS
  analyzeBrandingComprehensive(channel, brandingSettings) {
    const snippet = channel.snippet;
    
    const channelNameAnalysis = {
      clarity: this.analyzeChannelNameClarity(snippet.title),
      memorability: this.analyzeChannelNameMemorability(snippet.title),
      nicheAlignment: this.analyzeChannelNameNiche(snippet.title, snippet.description)
    };
    
    const visualIdentity = {
      profileImageQuality: snippet.thumbnails?.high ? 85 : 45,
      bannerPresent: !!brandingSettings.image?.bannerExternalUrl,
      bannerQuality: brandingSettings.image?.bannerExternalUrl ? 80 : 30,
      visualConsistency: this.analyzeVisualConsistency(snippet.thumbnails, brandingSettings)
    };
    
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

  analyzeContentStrategyComprehensive(videos, channelSnippet) {
    const uploadAnalysis = this.analyzeUploadPattern(videos);
    const themeAnalysis = this.analyzeContentThemes(videos);
    const formatAnalysis = this.analyzeVideoFormats(videos);
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
    
    const organizationAnalysis = this.analyzePlaylistOrganization(playlists);
    const bingeAnalysis = this.analyzeBingeWatchingPotential(playlists);
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

  // ALL HELPER METHODS
  analyzeChannelNameClarity(name) {
    let score = 50;
    if (name.length >= 5 && name.length <= 25) score += 25;
    if (!name.includes('Official') && !name.includes('TV')) score += 15;
    if (name.split(' ').length <= 3) score += 10;
    return Math.min(score, 100);
  }

  analyzeChannelNameMemorability(name) {
    let score = 50;
    if (name.length <= 20) score += 20;
    if (!/\d{4,}/.test(name)) score += 15;
    if (!name.includes('_') && !name.includes('-')) score += 15;
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

  analyzeThumbnailsComprehensive(videos) {
    const thumbnailScores = videos.map(video => this.analyzeThumbnailComprehensive(video.thumbnails));
    const averageScore = thumbnailScores.reduce((sum, analysis) => sum + analysis.score, 0) / thumbnailScores.length || 0;
    
    return {
      averageScore,
      thumbnailAnalyses: thumbnailScores,
      customThumbnailsDetected: thumbnailScores.filter(analysis => analysis.hasMaxRes).length
    };
  }

  analyzePlaylistOrganization(playlists) {
    if (!playlists || playlists.length === 0) {
      return {
        score: 0,
        hasPlaylists: false,
        playlistCount: 0,
        averageVideosPerPlaylist: 0
      };
    }
    
    let score = 20;
    
    if (playlists.length >= 3) score += 30;
    if (playlists.length >= 5) score += 20;
    if (playlists.length >= 8) score += 20;
    
    const totalVideos = playlists.reduce((sum, playlist) => sum + (playlist.contentDetails?.itemCount || 0), 0);
    const avgVideosPerPlaylist = totalVideos / playlists.length;
    
    if (avgVideosPerPlaylist >= 5) score += 10;
    
    return {
      score: Math.min(score, 100),
      hasPlaylists: true,
      playlistCount: playlists.length,
      averageVideosPerPlaylist: avgVideosPerPlaylist,
      totalVideosInPlaylists: totalVideos
    };
  }

  analyzeBingeWatchingPotential(playlists) {
    if (!playlists || playlists.length === 0) {
      return {
        score: 0,
        potential: 'Low',
        longestPlaylist: 0
      };
    }
    
    const playlistSizes = playlists.map(p => p.contentDetails?.itemCount || 0);
    const longestPlaylist = Math.max(...playlistSizes);
    const avgPlaylistSize = playlistSizes.reduce((sum, size) => sum + size, 0) / playlistSizes.length;
    
    let score = 0;
    let potential = 'Low';
    
    if (longestPlaylist >= 10) {
      score += 40;
      potential = 'Medium';
    }
    if (longestPlaylist >= 20) {
      score += 30;
      potential = 'High';
    }
    if (avgPlaylistSize >= 8) {
      score += 30;
      potential = 'High';
    }
    
    return {
      score: Math.min(score, 100),
      potential,
      longestPlaylist,
      averagePlaylistSize: avgPlaylistSize
    };
  }

  analyzeThematicGrouping(playlists, videos) {
    if (!playlists || playlists.length === 0) {
      return {
        score: 0,
        themes: [],
        coverage: 0
      };
    }
    
    const playlistTitles = playlists.map(p => p.snippet?.title || '').filter(title => title);
    const themes = playlistTitles.map(title => {
      const words = title.toLowerCase().split(' ');
      return words.filter(word => word.length > 3);
    }).flat();
    
    const uniqueThemes = [...new Set(themes)];
    const themeFreq = {};
    themes.forEach(theme => {
      themeFreq[theme] = (themeFreq[theme] || 0) + 1;
    });
    
    const topThemes = Object.entries(themeFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));
    
    let score = 30;
    if (uniqueThemes.length >= 3) score += 35;
    if (uniqueThemes.length >= 5) score += 35;
    
    const totalVideosInPlaylists = playlists.reduce((sum, p) => sum + (p.contentDetails?.itemCount || 0), 0);
    const coverage = (totalVideosInPlaylists / videos.length) * 100;
    
    return {
      score: Math.min(score, 100),
      themes: topThemes,
      coverage,
      uniqueThemeCount: uniqueThemes.length
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

  analyzeEngagementConsistency(videos) {
    const engagementRates = videos.map(v => v.engagementRate);
    const avgEngagement = engagementRates.reduce((sum, rate) => sum + rate, 0) / engagementRates.length || 0;
    
    const variance = engagementRates.reduce((sum, rate) => sum + Math.pow(rate - avgEngagement, 2), 0) / engagementRates.length;
    const stdDev = Math.sqrt(variance);
    
    const consistencyScore = Math.max(0, 100 - (stdDev * 10));
    
    return consistencyScore;
  }

  // STRENGTH/WEAKNESS IDENTIFICATION HELPERS
  identifyTitleStrengths(titleScores) {
    const strengths = [];
    const avgLength = titleScores.reduce((sum, t) => sum + t.length, 0) / titleScores.length;
    const hasNumbersPercent = (titleScores.filter(t => t.hasNumbers).length / titleScores.length) * 100;
    
    if (avgLength >= 30 && avgLength <= 60) strengths.push('Good title length');
    if (hasNumbersPercent > 60) strengths.push('Good use of numbers in titles');
    
    return strengths;
  }

  identifyTitleWeaknesses(titleScores) {
    const weaknesses = [];
    const avgLength = titleScores.reduce((sum, t) => sum + t.length, 0) / titleScores.length;
    const lowScores = titleScores.filter(t => t.score < 60).length;
    
    if (avgLength < 30) weaknesses.push('Titles too short');
    if (avgLength > 70) weaknesses.push('Titles too long');
    if (lowScores > titleScores.length * 0.5) weaknesses.push('Many titles need SEO improvement');
    
    return weaknesses;
  }

  identifyDescriptionStrengths(descriptionScores) {
    const strengths = [];
    const hasLinksPercent = (descriptionScores.filter(d => d.hasLinks).length / descriptionScores.length) * 100;
    const hasTimestampsPercent = (descriptionScores.filter(d => d.hasTimestamps).length / descriptionScores.length) * 100;
    
    if (hasLinksPercent > 70) strengths.push('Good use of links');
    if (hasTimestampsPercent > 50) strengths.push('Good use of timestamps');
    
    return strengths;
  }

  identifyDescriptionWeaknesses(descriptionScores) {
    const weaknesses = [];
    const shortDescriptions = descriptionScores.filter(d => d.length < 200).length;
    const noCTA = descriptionScores.filter(d => !d.hasCallToAction).length;
    
    if (shortDescriptions > descriptionScores.length * 0.5) weaknesses.push('Many descriptions too short');
    if (noCTA > descriptionScores.length * 0.7) weaknesses.push('Missing calls-to-action');
    
    return weaknesses;
  }

  identifyTagStrengths(tagScores) {
    const strengths = [];
    const goodTagCount = tagScores.filter(t => t.count >= 8 && t.count <= 15).length;
    
    if (goodTagCount > tagScores.length * 0.7) strengths.push('Good tag quantity');
    
    return strengths;
  }

  identifyTagWeaknesses(tagScores) {
    const weaknesses = [];
    const noTags = tagScores.filter(t => t.count === 0).length;
    const fewTags = tagScores.filter(t => t.count < 5).length;
    
    if (noTags > tagScores.length * 0.3) weaknesses.push('Many videos missing tags');
    if (fewTags > tagScores.length * 0.5) weaknesses.push('Insufficient tag usage');
    
    return weaknesses;
  }

  // HELPER METHODS FOR PATTERNS AND ISSUES
  identifyTitlePatterns(highPerforming, lowPerforming) {
    const highAvgLength = highPerforming.reduce((sum, v) => sum + v.title.length, 0) / highPerforming.length;
    const lowAvgLength = lowPerforming.reduce((sum, v) => sum + v.title.length, 0) / lowPerforming.length;
    
    return {
      observation: `High performing videos average ${highAvgLength.toFixed(0)} characters vs ${lowAvgLength.toFixed(0)} for low performing`,
      sample: "Pattern observed in current data set"
    };
  }

  identifyTitleIssues(titleScores) {
    const issues = [];
    const shortTitles = titleScores.filter(t => t.length < 30).length;
    const veryLongTitles = titleScores.filter(t => t.length > 70).length;
    
    if (shortTitles > 0) issues.push(`${shortTitles} titles under 30 characters`);
    if (veryLongTitles > 0) issues.push(`${veryLongTitles} titles over 70 characters`);
    
    return issues;
  }

  identifyDescriptionIssues(descriptionScores, videos) {
    const issues = [];
    const emptyDescs = descriptionScores.filter(d => d.length < 50).length;
    const noTimestamps = descriptionScores.filter(d => !d.hasTimestamps).length;
    
    if (emptyDescs > 0) issues.push(`${emptyDescs} videos with minimal descriptions`);
    if (noTimestamps > videos.length * 0.8) issues.push(`${noTimestamps} videos missing timestamps`);
    
    return issues;
  }

  analyzeLikePatterns(videos) {
    const videosWithCTA = videos.filter(v => 
      v.description && v.description.toLowerCase().includes('like')
    ).length;
    
    return `${videosWithCTA} out of ${videos.length} videos mention likes in descriptions`;
  }

  identifyEngagementPositives(viewsToSubsRatio, avgLikeRatio, commentAnalysis) {
    const positives = [];
    
    if (viewsToSubsRatio > 15) positives.push('Strong subscriber engagement');
    if (avgLikeRatio > 2) positives.push('Good like rates');
    if (commentAnalysis.qualityScore > 70) positives.push('Active comment community');
    
    return positives.length > 0 ? positives : ['Room for improvement across all metrics'];
  }

  // EXPLANATION METHODS
  explainSEOScore(overallScore, titleAnalysis, descriptionAnalysis, tagsAnalysis) {
    const explanations = [];
    
    if (titleAnalysis.averageScore < 60) {
      explanations.push(`Title optimization is weak (${titleAnalysis.averageScore.toFixed(1)}/100) - affecting 30% of overall SEO score`);
    }
    
    if (descriptionAnalysis.averageScore < 60) {
      explanations.push(`Description quality is poor (${descriptionAnalysis.averageScore.toFixed(1)}/100) - affecting 30% of overall SEO score`);
    }
    
    if (tagsAnalysis.averageScore < 20) {
      explanations.push(`Tag strategy is almost non-existent (${tagsAnalysis.averageScore.toFixed(1)}/100) - severely impacting discoverability`);
    }
    
    const primaryIssue = tagsAnalysis.averageScore < 20 ? "tags" : 
                        titleAnalysis.averageScore < descriptionAnalysis.averageScore ? "titles" : "descriptions";
    
    return {
      score: overallScore,
      grade: this.getScoreGrade(overallScore),
      primaryIssue: primaryIssue,
      explanations: explanations,
      quickWin: this.identifyQuickSEOWin(titleAnalysis, descriptionAnalysis, tagsAnalysis)
    };
  }

  explainEngagementScore(overallScore, viewsToSubsRatio, avgLikeRatio, commentAnalysis) {
    const issues = [];
    
    if (viewsToSubsRatio < 8) {
      issues.push(`Views-to-subscribers ratio is low (${viewsToSubsRatio.toFixed(1)}%) - subscribers aren't watching`);
    }
    
    if (avgLikeRatio < 1.5) {
      issues.push(`Like ratio is below benchmark (${avgLikeRatio.toFixed(2)}% vs 2-4% ideal)`);
    }
    
    if (commentAnalysis.qualityScore < 50) {
      issues.push(`Comment engagement is weak (${commentAnalysis.qualityScore.toFixed(1)}/100)`);
    }
    
    const primaryConcern = viewsToSubsRatio < 5 ? "subscriber engagement" :
                          avgLikeRatio < 1 ? "like engagement" : "overall engagement";
    
    return {
      score: overallScore,
      grade: this.getScoreGrade(overallScore),
      primaryConcern: primaryConcern,
      issues: issues,
      positives: this.identifyEngagementPositives(viewsToSubsRatio, avgLikeRatio, commentAnalysis)
    };
  }

  explainContentQualityScore(overallScore, hookAnalysis, structureAnalysis, ctaAnalysis) {
    const weakestAreas = [];
    
    if (hookAnalysis.score < 50) weakestAreas.push('hooks');
    if (structureAnalysis.score < 50) weakestAreas.push('structure');
    if (ctaAnalysis.score < 50) weakestAreas.push('calls-to-action');
    
    return {
      score: overallScore,
      grade: this.getScoreGrade(overallScore),
      weakestArea: weakestAreas.length > 0 ? weakestAreas[0] : 'overall optimization',
      issues: weakestAreas
    };
  }

  explainTagsScore(score, noTagsCount, avgTagCount) {
    if (noTagsCount > 0) {
      return {
        reason: `${noTagsCount} videos have zero tags`,
        impact: "YouTube cannot properly categorize these videos",
        urgency: "Critical - fix immediately"
      };
    } else if (avgTagCount < 5) {
      return {
        reason: `Average of only ${avgTagCount.toFixed(1)} tags per video`,
        impact: "Missing opportunities for discovery",
        urgency: "High - expand tag strategy"
      };
    } else {
      return {
        reason: "Good tag usage detected",
        impact: "Videos are properly categorized",
        urgency: "Low - maintain current approach"
      };
    }
  }

  identifyQuickSEOWin(titleAnalysis, descriptionAnalysis, tagsAnalysis) {
    if (tagsAnalysis.videosWithNoTagsCount > 0) {
      return {
        action: "Add tags to videos with zero tags",
        effort: "Low (15 minutes)",
        impact: "High",
        specifics: `${tagsAnalysis.videosWithNoTagsCount} videos need immediate tag addition`
      };
    } else if (titleAnalysis.averageLength < 35) {
      return {
        action: "Extend short titles",
        effort: "Medium (5 min per video)",
        impact: "Medium-High",
        specifics: "Focus on titles under 30 characters first"
      };
    } else if (descriptionAnalysis.hasTimestampsPercentage < 30) {
      return {
        action: "Add timestamps to long videos",
        effort: "Medium (10 min per video)",
        impact: "Medium",
        specifics: "Prioritize videos over 8 minutes"
      };
    } else {
      return {
        action: "Optimize thumbnail consistency",
        effort: "High",
        impact: "Medium",
        specifics: "Create custom thumbnails with consistent branding"
      };
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

  // RECOMMENDATION GENERATORS
  generateBrandingRecommendations(channelName, visualIdentity, aboutSection) {
    const recommendations = [];
    
    if (channelName.clarity < 70) {
      recommendations.push({
        priority: 'Medium',
        category: 'Channel Name',
        action: 'Consider a clearer, more memorable channel name'
      });
    }
    
    if (visualIdentity.bannerQuality < 70) {
      recommendations.push({
        priority: 'High',
        category: 'Visual Identity',
        action: 'Create a professional channel banner'
      });
    }
    
    if (!aboutSection.hasWebsiteLinks) {
      recommendations.push({
        priority: 'Medium',
        category: 'About Section',
        action: 'Add website links to channel description'
      });
    }
    
    return recommendations;
  }

  generateContentStrategyRecommendations(upload, themes, formats, audience) {
    const recommendations = [];
    
    if (upload.consistencyScore < 70) {
      recommendations.push({
        priority: 'High',
        category: 'Upload Schedule',
        action: 'Establish a more consistent upload schedule'
      });
    }
    
    if (themes.clarityScore < 70) {
      recommendations.push({
        priority: 'Medium',
        category: 'Content Focus',
        action: 'Narrow down to 3-5 core content themes'
      });
    }
    
    return recommendations;
  }

  generateSEORecommendations(titles, descriptions, tags, thumbnails) {
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
        priority: 'Medium',
        category: 'Tag Strategy',
        action: 'Use 8-15 relevant tags per video'
      });
    }
    
    return recommendations;
  }

  generateEngagementRecommendations(viewsScore, likeScore, commentAnalysis) {
    const recommendations = [];
    
    if (viewsScore < 60) {
      recommendations.push({
        priority: 'High',
        category: 'View Performance',
        action: 'Focus on better thumbnails and titles to increase CTR'
      });
    }
    
    if (likeScore < 50) {
      recommendations.push({
        priority: 'Medium',
        category: 'Like Engagement',
        action: 'Ask viewers to like videos and provide value upfront'
      });
    }
    
    if (commentAnalysis.qualityScore < 50) {
      recommendations.push({
        priority: 'Medium',
        category: 'Comment Engagement',
        action: 'Ask questions and engage with comments to boost interaction'
      });
    }
    
    return recommendations;
  }

  generateContentQualityRecommendations(hooks, structure, cta, professional) {
    const recommendations = [];
    
    if (hooks.score < 60) {
      recommendations.push({
        priority: 'High',
        category: 'Video Hooks',
        action: 'Create stronger opening hooks with questions or surprising facts'
      });
    }
    
    if (structure.score < 60) {
      recommendations.push({
        priority: 'Medium',
        category: 'Content Structure',
        action: 'Add timestamps and clear sections to improve structure'
      });
    }
    
    if (cta.score < 50) {
      recommendations.push({
        priority: 'Medium',
        category: 'Calls to Action',
        action: 'Include clear subscribe and engagement prompts'
      });
    }
    
    return recommendations;
  }

  generatePlaylistRecommendations(organization, binge, thematic) {
    const recommendations = [];
    
    if (!organization.hasPlaylists) {
      recommendations.push({
        priority: 'High',
        category: 'Playlist Creation',
        action: 'Create 5+ playlists to organize content by topic'
      });
    }
    
    if (binge.potential === 'Low') {
      recommendations.push({
        priority: 'Medium',
        category: 'Playlist Length',
        action: 'Create longer playlists (10+ videos) for binge-watching'
      });
    }
    
    if (thematic.score < 60) {
      recommendations.push({
        priority: 'Medium',
        category: 'Thematic Organization',
        action: 'Group videos by clear themes and topics'
      });
    }
    
    return recommendations;
  }

  generatePriorityRecommendations(analysisResults) {
    const allRecommendations = [
      ...analysisResults.branding.recommendations,
      ...analysisResults.content.recommendations,
      ...analysisResults.seo.recommendations,
      ...analysisResults.engagement.recommendations,
      ...analysisResults.quality.recommendations,
      ...analysisResults.playlists.recommendations
    ];
    
    const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
    
    return allRecommendations
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, 10);
  }

  generateHookRecommendations(averageScore, weakHooksCount, totalVideos) {
    const recommendations = [];
    
    if (averageScore < 60) {
      recommendations.push('Use more engaging titles with questions, numbers, or power words');
    }
    
    if (weakHooksCount > totalVideos * 0.5) {
      recommendations.push('Focus on creating curiosity rather than just describing content');
    }
    
    return recommendations;
  }

  generateNextSteps(analysis) {
    const steps = [];
    
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
    
    return steps.slice(0, 8);
  }

  identifyVideoIssues(video) {
    const issues = [];
    
    if (!video.tags || video.tags.length === 0) issues.push('NO TAGS');
    if (video.title.length < 30) issues.push('SHORT TITLE');
    if (!video.description || video.description.length < 100) issues.push('POOR DESC');
    if (video.titleAnalysis?.score < 50) issues.push('WEAK HOOK');
    
    return issues.length > 0 ? issues.join(', ') : '✅ Good';
  }

  async writeToSheets(analysis) {
    console.log('📝 Writing comprehensive results with detailed insights to Google Sheets...');
    
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      console.log('⚠️ No Google Sheet ID provided, skipping sheet update');
      return;
    }

    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'A1:Z1000'
      });

      const values = [
        ['🎥 COMPREHENSIVE YOUTUBE CHANNEL ANALYSIS WITH DETAILED INSIGHTS', '', '', '', ''],
        ['Generated:', new Date().toLocaleString(), '', '', ''],
        ['', '', '', '', ''],
        
        ['📊 CHANNEL OVERVIEW', '', '', '', ''],
        ['Channel Name', analysis.channel.name, '', '', ''],
        ['Subscribers', analysis.channel.subscriberCount.toLocaleString(), '', '', ''],
        ['Total Views', analysis.channel.totalViews.toLocaleString(), '', '', ''],
        ['Video Count', analysis.channel.videoCount, '', '', ''],
        ['Channel Age', Math.floor((Date.now() - new Date(analysis.channel.createdAt)) / (1000 * 60 * 60 * 24 * 365)) + ' years', '', '', ''],
        ['Country', analysis.channel.country || 'Not specified', '', '', ''],
        ['', '', '', '', ''],
        
        ['📈 OVERALL PERFORMANCE SCORES & EXPLANATIONS', '', '', '', ''],
        ['Branding & Identity', `${analysis.overallScores.brandingScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.brandingScore), '', ''],
        ['Content Strategy', `${analysis.overallScores.contentStrategyScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.contentStrategyScore), '', ''],
        ['SEO & Metadata', `${analysis.overallScores.seoScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.seoScore), '', ''],
        ['  ↳ Primary Issue:', analysis.seoMetadata.scoreExplanation?.primaryIssue || 'Multiple factors', '', '', ''],
        ['  ↳ Quick Win:', analysis.seoMetadata.scoreExplanation?.quickWin?.action || 'See recommendations', '', '', ''],
        ['Engagement Signals', `${analysis.overallScores.engagementScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.engagementScore), '', ''],
        ['  ↳ Primary Concern:', analysis.engagementSignals.scoreExplanation?.primaryConcern || 'Overall engagement', '', '', ''],
        ['Content Quality', `${analysis.overallScores.contentQualityScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.contentQualityScore), '', ''],
        ['  ↳ Weakest Area:', analysis.contentQuality.scoreExplanation?.weakestArea || 'Multiple areas', '', '', ''],
        ['Playlist Structure', `${analysis.overallScores.playlistScore.toFixed(1)}/100`, this.getScoreGrade(analysis.overallScores.playlistScore), '', ''],
        ['', '', '', '', ''],
        
        ['🔍 DETAILED SEO ANALYSIS & INSIGHTS', '', '', '', ''],
        ['Overall SEO Score', `${analysis.seoMetadata.overallScore.toFixed(1)}/100`, analysis.seoMetadata.scoreExplanation?.grade || '', '', ''],
        ['', '', '', '', ''],
        ['WHY YOUR SEO SCORE IS LOW:', '', '', '', ''],
        ...analysis.seoMetadata.scoreExplanation?.explanations?.map(exp => ['  • ' + exp, '', '', '', '']) || [],
        ['', '', '', '', ''],
        
        ['🚨 CRITICAL SEO ISSUES FOUND:', '', '', '', ''],
        ...analysis.seoMetadata.detailedInsights?.filter(insight => insight.severity === 'Critical').map(insight => [
          `${insight.category}:`, insight.finding, '', '', ''
        ]) || [],
        ['', '', '', '', ''],
        
        ['⚠️ HIGH PRIORITY SEO ISSUES:', '', '', '', ''],
        ...analysis.seoMetadata.detailedInsights?.filter(insight => insight.severity === 'High').map(insight => [
          `${insight.category}:`, insight.finding, insight.solution, '', ''
        ]) || [],
        ['', '', '', '', ''],
        
        ['📝 TITLE ANALYSIS BREAKDOWN', '', '', '', ''],
        ['Average Title Length', `${analysis.seoMetadata.titles.averageLength?.toFixed(1)} characters`, '', '', ''],
        ['Optimal Length %', `${analysis.seoMetadata.titles.optimalLengthPercentage?.toFixed(1)}%`, 'Target: 80%+', '', ''],
        ['Titles with Numbers', `${analysis.seoMetadata.titles.hasNumbersPercentage?.toFixed(1)}%`, 'Target: 60%+', '', ''],
        ['Question-based Titles', `${analysis.seoMetadata.titles.isQuestionPercentage?.toFixed(1)}%`, 'Target: 30%+', '', ''],
        ['Best Performing Title', analysis.seoMetadata.titles.bestPerformingTitle?.title.substring(0, 50) + '...', 
          analysis.seoMetadata.titles.bestPerformingTitle?.views.toLocaleString() + ' views', '', ''],
        ['Worst Performing Title', analysis.seoMetadata.titles.worstPerformingTitle?.title.substring(0, 50) + '...', 
          analysis.seoMetadata.titles.worstPerformingTitle?.views.toLocaleString() + ' views', '', ''],
        ['', '', '', '', ''],
        
        ['📄 DESCRIPTION ANALYSIS BREAKDOWN', '', '', '', ''],
        ['Average Description Length', `${analysis.seoMetadata.descriptions.averageLength?.toFixed(0)} characters`, '', '', ''],
        ['Videos with Adequate Length', `${analysis.seoMetadata.descriptions.adequateLengthPercentage?.toFixed(1)}%`, 'Target: 80%+', '', ''],
        ['Videos with Links', `${analysis.seoMetadata.descriptions.hasLinksPercentage?.toFixed(1)}%`, 'Target: 70%+', '', ''],
        ['Videos with Timestamps', `${analysis.seoMetadata.descriptions.hasTimestampsPercentage?.toFixed(1)}%`, 'Target: 50%+', '', ''],
        ['Videos with CTAs', `${analysis.seoMetadata.descriptions.hasCTAPercentage?.toFixed(1)}%`, 'Target: 90%+', '', ''],
        ['Videos with No Description', analysis.seoMetadata.descriptions.emptyDescriptionsCount || 0, 'Target: 0', '', ''],
        ['', '', '', '', ''],
        
        ['🏷️ TAGS ANALYSIS BREAKDOWN', '', '', '', ''],
        ['Average Tags per Video', analysis.seoMetadata.tags.averageTagCount?.toFixed(1), 'Target: 8-15', '', ''],
        ['Videos with NO TAGS', analysis.seoMetadata.tags.videosWithNoTagsCount, 'Target: 0', '🚨 CRITICAL', ''],
        ['Videos with Few Tags (<5)', analysis.seoMetadata.tags.videosWithFewTagsCount, '', '⚠️ WARNING', ''],
        ['Videos with Good Tags (8-15)', analysis.seoMetadata.tags.videosWithGoodTagsCount, '', '✅ GOOD', ''],
        ['% Videos Missing Tags', `${analysis.seoMetadata.tags.noTagsPercentage?.toFixed(1)}%`, 'Target: 0%', '', ''],
        ['Total Unique Tags Used', analysis.seoMetadata.tags.totalUniqueTagsUsed, '', '', ''],
        ['', '', '', '', ''],
        
        ['🎯 VIDEOS NEEDING IMMEDIATE TAG ATTENTION:', '', '', '', ''],
        ['Video Title', 'Current Views', 'Tag Status', 'Priority', ''],
        ...analysis.seoMetadata.tags.specificVideosNeedingTags?.map(video => [
          video.title,
          video.views.toLocaleString(),
          'NO TAGS',
          'HIGH',
          ''
        ]) || [],
        ['', '', '', '', ''],
        
        ['💬 DETAILED ENGAGEMENT ANALYSIS & INSIGHTS', '', '', '', ''],
        ['Overall Engagement Score', `${analysis.engagementSignals.overallScore.toFixed(1)}/100`, 
          analysis.engagementSignals.scoreExplanation?.grade || '', '', ''],
        ['Primary Concern', analysis.engagementSignals.scoreExplanation?.primaryConcern || 'Multiple factors', '', '', ''],
        ['', '', '', '', ''],
        
        ['🔍 ENGAGEMENT ISSUES IDENTIFIED:', '', '', '', ''],
        ...analysis.engagementSignals.detailedInsights?.map(insight => [
          `${insight.category}:`, insight.finding, insight.solution, insight.severity, ''
        ]) || [],
        ['', '', '', '', ''],
        
        ['🎬 DETAILED CONTENT QUALITY ANALYSIS', '', '', '', ''],
        ['Overall Content Quality Score', `${analysis.contentQuality.overallScore.toFixed(1)}/100`, 
          this.getScoreGrade(analysis.contentQuality.overallScore), '', ''],
        ['', '', '', '', ''],
        
        ['Hook Effectiveness Analysis:', '', '', '', ''],
        ['Average Hook Score', `${analysis.contentQuality.hooks.score?.toFixed(1)}/100`, '', '', ''],
        ['Videos with Strong Hooks', analysis.contentQuality.hooks.videosWithStrongHooks || 0, '', '', ''],
        ['Videos with Weak Hooks', analysis.contentQuality.hooks.videosWithWeakHooks || 0, '', '⚠️ NEEDS WORK', ''],
        ['Best Hook Example', analysis.contentQuality.hooks.bestExample?.videoTitle?.substring(0, 50) + '...' || 'N/A', '', '', ''],
        ['Worst Hook Example', analysis.contentQuality.hooks.worstExample?.videoTitle?.substring(0, 50) + '...' || 'N/A', '', '', ''],
        ['', '', '', '', ''],
        
        ['🎣 HOOK IMPROVEMENT INSIGHTS:', '', '', '', ''],
        ...analysis.contentQuality.hooks.hookInsights?.map(insight => [
          insight.finding, insight.impact, insight.pattern, '', ''
        ]) || [],
        ['', '', '', '', ''],
        
        ['🎯 PRIORITY RECOMMENDATIONS WITH DETAILED EXPLANATIONS', '', '', '', ''],
        ['Priority', 'Action Item', 'Why This Matters', 'Expected Impact', 'Time Investment'],
        ...analysis.priorityRecommendations.slice(0, 10).map((rec, index) => [
          rec.priority || 'Medium',
          `${index + 1}. ${rec.action}`,
          rec.reasoning || 'Improves overall channel performance',
          rec.impact || 'Medium',
          rec.timeInvestment || 'Variable'
        ]),
        ['', '', '', '', ''],
        
        ['⚡ IMMEDIATE ACTION ITEMS (Do This Week)', '', '', '', ''],
        ['Action', 'Specific Videos/Areas', 'Time Required', 'Expected Result', ''],
        
        ...(analysis.seoMetadata.tags.videosWithNoTagsCount > 0 ? [[
          'Add tags to videos with zero tags',
          `${analysis.seoMetadata.tags.videosWithNoTagsCount} videos identified`,
          '2-3 hours total',
          'Immediate discoverability improvement',
          ''
        ]] : []),
        
        ...(analysis.seoMetadata.titles.optimalLengthPercentage < 50 ? [[
          'Extend short titles to 40-60 characters',
          `${Math.round((1 - analysis.seoMetadata.titles.optimalLengthPercentage/100) * analysis.videos.length)} videos need work`,
          '1-2 hours',
          'Better SEO and click-through rates',
          ''
        ]] : []),
        
        ...(analysis.engagementSignals.viewsToSubscribers.ratio < 8 ? [[
          'Improve subscriber engagement',
          'Focus on notification bell and video hooks',
          '30 min per video',
          'Higher view counts from existing subscribers',
          ''
        ]] : []),
        
        ['', '', '', '', ''],
        
        ['📊 PERFORMANCE BENCHMARKS & INDUSTRY COMPARISON', '', '', '', ''],
        ['Metric', 'Your Channel', 'Industry Benchmark', 'Status', 'Gap Analysis'],
        ['Upload Consistency', `${analysis.contentStrategy?.uploadPattern?.consistencyScore?.toFixed(1)}%`, '80%+', 
          analysis.contentStrategy?.uploadPattern?.consistencyScore >= 80 ? '✅ Good' : '⚠️ Needs Improvement',
          analysis.contentStrategy?.uploadPattern?.consistencyScore < 80 ? 
            `${(80 - analysis.contentStrategy.uploadPattern.consistencyScore).toFixed(1)}% below benchmark` : 'Meeting benchmark'],
        ['SEO Optimization', `${analysis.seoMetadata.overallScore.toFixed(1)}/100`, '75+', 
          analysis.seoMetadata.overallScore >= 75 ? '✅ Good' : '⚠️ Needs Improvement',
          analysis.seoMetadata.overallScore < 75 ? 
            `${(75 - analysis.seoMetadata.overallScore).toFixed(1)} points below benchmark` : 'Meeting benchmark'],
        ['Engagement Rate', `${analysis.engagementSignals.overallScore.toFixed(1)}/100`, '70+', 
          analysis.engagementSignals.overallScore >= 70 ? '✅ Good' : '⚠️ Needs Improvement',
          analysis.engagementSignals.overallScore < 70 ? 
            `${(70 - analysis.engagementSignals.overallScore).toFixed(1)} points below benchmark` : 'Meeting benchmark'],
        ['Content Quality', `${analysis.contentQuality.overallScore.toFixed(1)}/100`, '75+', 
          analysis.contentQuality.overallScore >= 75 ? '✅ Good' : '⚠️ Needs Improvement',
          analysis.contentQuality.overallScore < 75 ? 
            `${(75 - analysis.contentQuality.overallScore).toFixed(1)} points below benchmark` : 'Meeting benchmark'],
        ['', '', '', '', ''],
        
        ['📹 DETAILED VIDEO ANALYSIS WITH INSIGHTS (Recent 15 Videos)', '', '', '', ''],
        ['Title', 'Views', 'Tags Count', 'Title Length', 'Hook Score', 'Issues Found'],
        ...analysis.videos.slice(0, 15).map(video => [
          video.title.length > 40 ? video.title.substring(0, 37) + '...' : video.title,
          video.views.toLocaleString(),
          video.tags?.length || 0,
          video.title.length,
          video.titleAnalysis?.score?.toFixed(0) || 'N/A',
          this.identifyVideoIssues(video)
        ]),
        ['', '', '', '', ''],
        
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
        
        ['📋 ANALYSIS METADATA', '', '', '', ''],
        ['Analysis Date', new Date(analysis.analysisDate).toLocaleDateString(), '', '', ''],
        ['Videos Analyzed', analysis.videos.length, '', '', ''],
        ['Analysis Depth', 'Comprehensive with Detailed Insights', '', '', ''],
        ['Data Sources', 'YouTube Data API v3, Channel Analytics', '', '', ''],
        ['Analysis Version', '3.0 Enhanced Insights', '', '', '']
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log('✅ Comprehensive results with detailed insights written to Google Sheets successfully!');
    } catch (error) {
      console.error('❌ Failed to write to Google Sheets:', error.message);
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
    console.log('🎉 Enhanced analysis with detailed insights completed successfully!');
  } catch (error) {
    console.error('💥 Analysis failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = YouTubeChannelAnalyzer;
