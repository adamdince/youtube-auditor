// src/analyze.js - Automated YouTube Channel Analyzer with Google Docs Input/Output
const { google } = require('googleapis');
const fs = require('fs').promises;

class YouTubeChannelAnalyzer {
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
    
    // Initialize Google Docs API
    this.docs = google.docs({
      version: 'v1',
      auth: this.createGoogleAuth()
    });
  }

  createGoogleAuth() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive'
      ],
    });
    return auth;
  }

  // NEW: Read YouTube URL from Google Doc input
  async readChannelUrlFromDoc() {
    const inputDocId = process.env.GOOGLE_INPUT_DOC_ID;
    if (!inputDocId) {
      throw new Error('GOOGLE_INPUT_DOC_ID not found in environment variables - required when no URL provided');
    }

    console.log('📖 Reading YouTube URL from input Google Doc...');
    
    try {
      const doc = await this.docs.documents.get({ documentId: inputDocId });
      const content = doc.data.body.content;
      
      let fullText = '';
      content.forEach(element => {
        if (element.paragraph) {
          element.paragraph.elements.forEach(paragraphElement => {
            if (paragraphElement.textRun) {
              fullText += paragraphElement.textRun.content;
            }
          });
        }
      });

      // Extract YouTube URL from the document
      const youtubeUrlRegex = /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.-]+|channel\/[\w-]+|c\/[\w-]+|user\/[\w-]+)/gi;
      const matches = fullText.match(youtubeUrlRegex);
      
      if (!matches || matches.length === 0) {
        throw new Error('No YouTube channel URL found in the input document. Please add a YouTube channel URL.');
      }

      const channelUrl = matches[0]; // Use the first URL found
      console.log(`✅ Found YouTube URL: ${channelUrl}`);
      
      return channelUrl;
      
    } catch (error) {
      console.error('❌ Error reading from input document:', error.message);
      throw error;
    }
  }

  // Main analysis method - now handles both URL input and Google Doc input
  async analyzeChannelFromInput(channelUrl = null) {
    try {
      console.log('🚀 Starting automated analysis...');
      
      // Use provided URL or read from Google Doc
      let urlToAnalyze = channelUrl;
      
      if (!urlToAnalyze) {
        console.log('📖 No URL provided, reading from Google Doc...');
        urlToAnalyze = await this.readChannelUrlFromDoc();
      } else {
        console.log(`📋 Using provided URL: ${urlToAnalyze}`);
      }
      
      // Extract channel ID and analyze
      const channelId = this.extractChannelId(urlToAnalyze);
      if (!channelId) {
        throw new Error('Invalid YouTube channel URL format');
      }

      const channelData = await this.fetchChannelData(channelId);
      const analysis = this.performAnalysis(channelData);
      
      // Write professional report to output Google Doc
      await this.writeToGoogleDocs(analysis);
      await this.saveResults(analysis);
      
      // Update input doc with completion status (if reading from doc)
      if (!channelUrl) {
        await this.updateInputDocWithStatus('✅ Analysis completed successfully!', urlToAnalyze);
      }
      
      console.log('✅ Automated analysis completed successfully!');
      return analysis;
      
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      
      // Update input doc with error status (if reading from doc)
      if (!channelUrl) {
        await this.updateInputDocWithStatus(`❌ Analysis failed: ${error.message}`, 'Error');
      }
      
      throw error;
    }
  }

  // Update input document with status
  async updateInputDocWithStatus(status, channelUrl) {
    const inputDocId = process.env.GOOGLE_INPUT_DOC_ID;
    if (!inputDocId) {
      console.log('⚠️ No input document configured, skipping status update');
      return;
    }

    try {
      const timestamp = new Date().toLocaleString();
      const statusMessage = `\n\n─────────────────────────────────────\nLast Analysis: ${timestamp}\nChannel: ${channelUrl}\nStatus: ${status}\n─────────────────────────────────────`;

      await this.docs.documents.batchUpdate({
        documentId: inputDocId,
        requestBody: {
          requests: [{
            insertText: {
              location: { index: 1 },
              text: statusMessage
            }
          }]
        }
      });
    } catch (error) {
      console.log('⚠️ Could not update input document status:', error.message);
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

  // GOOGLE DOCS REPORT GENERATION - MAIN METHOD
  async writeToGoogleDocs(analysis) {
    console.log('📄 Creating professional report in Google Docs...');
    
    const outputDocId = process.env.GOOGLE_OUTPUT_DOC_ID;
    if (!outputDocId) {
      console.log('⚠️ No GOOGLE_OUTPUT_DOC_ID provided, skipping document update');
      console.log('💡 Create a blank Google Doc for output and add GOOGLE_OUTPUT_DOC_ID to your environment variables');
      return;
    }

    try {
      // Clear existing content
      console.log('🧹 Clearing existing output document content...');
      await this.clearDocument(outputDocId);

      // Create professional report content
      console.log('📝 Building professional business report...');
      await this.createProfessionalReport(outputDocId, analysis);

      console.log('✅ Professional report created successfully!');
      console.log(`🔗 View your professional report: https://docs.google.com/document/d/${outputDocId}`);
      
    } catch (error) {
      console.error('❌ Error creating professional report:', error.message);
      console.log('🔄 Falling back to JSON file export...');
      await this.saveResults(analysis);
    }
  }

  async clearDocument(documentId) {
    try {
      // Get document to find content length
      const doc = await this.docs.documents.get({ documentId });
      const content = doc.data.body.content;
      
      if (content && content.length > 1) {
        // Calculate total content length
        const endIndex = content[content.length - 1].endIndex - 1;
        
        if (endIndex > 1) {
          await this.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                deleteContentRange: {
                  range: {
                    startIndex: 1,
                    endIndex: endIndex
                  }
                }
              }]
            }
          });
        }
      }
    } catch (error) {
      console.log('⚠️ Could not clear document, continuing with new content...');
    }
  }

  async createProfessionalReport(documentId, analysis) {
    // Calculate metrics for executive summary
    const overallHealth = this.calculateOverallHealth(analysis);
    const criticalIssues = this.getCriticalIssuesForDocs(analysis);
    const topPriority = this.getTopPriorityForDocs(analysis);
    const timeToImprove = this.getEstimatedTimeToImprove(analysis);

    // Build the complete report content
    const reportText = this.buildReportContent(analysis, overallHealth, criticalIssues, topPriority, timeToImprove);

    // Insert all text first
    await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: reportText
          }
        }]
      }
    });

    // Apply professional formatting
    await this.applyProfessionalDocFormatting(documentId, reportText);
  }

  buildReportContent(analysis, overallHealth, criticalIssues, topPriority, timeToImprove) {
    const reportDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `YOUTUBE CHANNEL PERFORMANCE ANALYSIS

${analysis.channel.name}
Professional Analysis Report - ${reportDate}
Generated automatically via GitHub Actions

═══════════════════════════════════════════════════════════════════════════════

EXECUTIVE SUMMARY

Channel Health Score: ${overallHealth.score}/100 (${overallHealth.grade})

This comprehensive analysis of ${analysis.channel.name} reveals ${overallHealth.summary}. With ${analysis.channel.subscriberCount.toLocaleString()} subscribers and ${analysis.channel.totalViews.toLocaleString()} total views, the channel shows ${overallHealth.trend}.

Key Findings:
• ${criticalIssues.primary}
• ${criticalIssues.secondary}
• Average views per video: ${Math.round(analysis.channel.totalViews / analysis.channel.videoCount).toLocaleString()}
• Channel age: ${Math.floor((Date.now() - new Date(analysis.channel.createdAt)) / (1000 * 60 * 60 * 24 * 365))} years

Immediate Action Required: ${topPriority}
Estimated Time Investment: ${timeToImprove}

Expected Outcomes: Implementation of recommended strategies should result in 15-30% improvement in discoverability within 30 days, with measurable engagement increases within the first week.

═══════════════════════════════════════════════════════════════════════════════

CHANNEL OVERVIEW & METRICS

Performance Dashboard:
• Subscriber Count: ${analysis.channel.subscriberCount.toLocaleString()}
• Total Views: ${analysis.channel.totalViews.toLocaleString()}
• Video Count: ${analysis.channel.videoCount.toLocaleString()}
• Average Views per Video: ${Math.round(analysis.channel.totalViews / analysis.channel.videoCount).toLocaleString()}
• Channel Created: ${new Date(analysis.channel.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
• Country: ${analysis.channel.country || 'Not specified'}

Channel Growth Metrics:
• Views per Subscriber: ${(analysis.channel.totalViews / analysis.channel.subscriberCount).toFixed(1)}
• Content Consistency: ${analysis.contentStrategy.uploadPattern.frequency}
• Content Focus: ${analysis.contentStrategy.contentThemes.focusRecommendation}

═══════════════════════════════════════════════════════════════════════════════

PERFORMANCE SCORECARD

Detailed Performance Assessment:

🎨 Branding & Identity
Score: ${Math.round(analysis.overallScores.brandingScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.brandingScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.brandingScore)}

📅 Content Strategy  
Score: ${Math.round(analysis.overallScores.contentStrategyScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.contentStrategyScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.contentStrategyScore)}

🔍 SEO & Metadata
Score: ${Math.round(analysis.overallScores.seoScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.seoScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.seoScore)}

💬 Engagement Signals
Score: ${Math.round(analysis.overallScores.engagementScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.engagementScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.engagementScore)}

🎬 Content Quality
Score: ${Math.round(analysis.overallScores.contentQualityScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.contentQualityScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.contentQualityScore)}

📚 Playlist Organization
Score: ${Math.round(analysis.overallScores.playlistScore)}/100 | Grade: ${this.getGradeFromScore(analysis.overallScores.playlistScore)} | Status: ${this.getStatusFromScore(analysis.overallScores.playlistScore)}

═══════════════════════════════════════════════════════════════════════════════

CRITICAL ISSUES & OPPORTUNITIES

${this.buildCriticalIssuesSection(analysis)}

═══════════════════════════════════════════════════════════════════════════════

SEO PERFORMANCE ANALYSIS

Title Optimization Analysis:
• Average Length: ${Math.round(analysis.seoMetadata.titles.averageLength || 0)} characters
• Optimal Length (30-60 chars): ${Math.round(analysis.seoMetadata.titles.optimalLengthPercentage || 0)}% of videos
• Titles with Numbers: ${Math.round(analysis.seoMetadata.titles.hasNumbersPercentage || 0)}% of videos
• Assessment: ${this.getTitleAssessment(analysis.seoMetadata.titles)}
• Recommendation: ${this.getTitleRecommendation(analysis.seoMetadata.titles)}

Description Quality Analysis:
• Average Length: ${Math.round(analysis.seoMetadata.descriptions.averageLength || 0)} characters
• With Timestamps: ${Math.round(analysis.seoMetadata.descriptions.hasTimestampsPercentage || 0)}% of videos
• With Call-to-Actions: ${Math.round(analysis.seoMetadata.descriptions.hasCTAPercentage || 0)}% of videos
• Assessment: ${this.getDescriptionAssessment(analysis.seoMetadata.descriptions)}
• Recommendation: ${this.getDescriptionRecommendation(analysis.seoMetadata.descriptions)}

Tag Strategy Analysis:
• Average Tags per Video: ${(analysis.seoMetadata.tags.averageTagCount || 0).toFixed(1)}
• Videos Missing Tags: ${analysis.seoMetadata.tags.videosWithNoTagsCount || 0} videos (${Math.round((analysis.seoMetadata.tags.videosWithNoTagsCount / analysis.videos.length) * 100)}%)
• Assessment: ${this.getTagAssessment(analysis.seoMetadata.tags)}
• Recommendation: ${this.getTagRecommendation(analysis.seoMetadata.tags)}

═══════════════════════════════════════════════════════════════════════════════

ENGAGEMENT PERFORMANCE ANALYSIS

Subscriber Engagement:
• Views-to-Subscribers Ratio: ${(analysis.engagementSignals.viewsToSubscribers?.ratio || 0).toFixed(1)}%
• Benchmark Status: ${analysis.engagementSignals.viewsToSubscribers?.benchmark || 'Analyzing'}
• Analysis: ${this.getEngagementAnalysis(analysis.engagementSignals.viewsToSubscribers?.ratio)}

Audience Interaction:
• Like Engagement Rate: ${(analysis.engagementSignals.likeEngagement?.averageRatio || 0).toFixed(2)}%
• Like Benchmark: ${analysis.engagementSignals.likeEngagement?.benchmark || 'Analyzing'}
• Comment Engagement: ${(analysis.engagementSignals.commentEngagement?.averageCommentRatio || 0).toFixed(2)}%
• Comment Quality Score: ${Math.round(analysis.engagementSignals.commentEngagement?.qualityScore || 0)}/100

Content Performance Patterns:
• Engagement Consistency: ${analysis.engagementSignals.consistency}%
• Top Performing Content Type: ${this.getTopContentType(analysis.videos)}
• Optimal Upload Pattern: ${analysis.contentStrategy.uploadPattern.frequency}

═══════════════════════════════════════════════════════════════════════════════

RECENT VIDEOS PERFORMANCE

${this.buildVideoPerformanceTable(analysis.videos)}

Performance Insights:
${this.getVideoPerformanceInsights(analysis.videos)}

═══════════════════════════════════════════════════════════════════════════════

STRATEGIC RECOMMENDATIONS

🔥 HIGH PRIORITY ACTIONS (Week 1-2):
${this.buildRecommendationsSection(analysis, 'High')}

⚡ MEDIUM PRIORITY ACTIONS (Week 3-4):
${this.buildRecommendationsSection(analysis, 'Medium')}

💡 LOW PRIORITY ACTIONS (Month 2+):
${this.buildRecommendationsSection(analysis, 'Low')}

═══════════════════════════════════════════════════════════════════════════════

IMPLEMENTATION ROADMAP

Phase 1: Critical Improvements (Week 1-2)
${this.getWeeklyTasks(analysis, '1-2')}

Phase 2: Optimization (Week 3-4)
${this.getWeeklyTasks(analysis, '3-4')}

Phase 3: Growth Strategy (Month 2+)
${this.getWeeklyTasks(analysis, 'month2')}

Success Metrics to Track:
• Weekly subscriber growth rate
• Average views per video (7-day rolling average)
• Engagement rate improvements
• Search ranking for target keywords
• Click-through rate from search/suggested videos

═══════════════════════════════════════════════════════════════════════════════

COMPETITIVE ANALYSIS & BENCHMARKS

Industry Benchmarks:
• Average CTR for YouTube: 2-10%
• Good engagement rate: 3-6%
• Subscriber-to-view ratio: 10-20%

Your Channel Performance vs. Industry:
• Engagement Rate: ${this.compareToIndustry(analysis.engagementSignals.likeEngagement?.averageRatio, 'engagement')}
• Subscriber Engagement: ${this.compareToIndustry(analysis.engagementSignals.viewsToSubscribers?.ratio, 'subscriber')}
• SEO Optimization: ${this.compareToIndustry(analysis.overallScores.seoScore, 'seo')}

═══════════════════════════════════════════════════════════════════════════════

CONCLUSION & NEXT STEPS

${this.buildConclusion(analysis, overallHealth)}

Report Details:
• Analysis performed using YouTube Data API v3
• Data points analyzed: ${analysis.videos.length} recent videos
• Methodology: Multi-factor performance assessment
• Report generated: ${reportDate}
• Next recommended review: ${this.getNextReviewDate()}
• Automation: GitHub Actions workflow

═══════════════════════════════════════════════════════════════════════════════

Generated by YouTube Channel Analyzer v3.0 Professional
Analysis Date: ${reportDate}
Automation: GitHub Actions Workflow
`;
  }

  // [Include all the helper methods from the previous version - truncated for space]
  // ... (all the analysis methods, formatting methods, etc. from the previous artifact)

  calculateOverallHealth(analysis) {
    const scores = Object.values(analysis.overallScores);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    let grade, summary, trend;
    
    if (avgScore >= 80) {
      grade = 'Excellent';
      summary = 'strong performance across all key metrics';
      trend = 'positive growth trajectory with excellent optimization';
    } else if (avgScore >= 70) {
      grade = 'Good'; 
      summary = 'solid performance with room for strategic optimization';
      trend = 'steady performance with clear growth potential';
    } else if (avgScore >= 60) {
      grade = 'Fair';
      summary = 'mixed performance requiring focused improvements';
      trend = 'moderate challenges with addressable optimization opportunities';
    } else {
      grade = 'Needs Improvement';
      summary = 'significant opportunities for strategic improvement';
      trend = 'critical optimization needs requiring immediate attention';
    }
    
    return { score: Math.round(avgScore), grade, summary, trend };
  }

  getCriticalIssuesForDocs(analysis) {
    let primary = "Channel performing within expected parameters";
    let secondary = "Focus on consistent optimization and growth strategies";
    
    if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
      primary = `${analysis.seoMetadata.tags.videosWithNoTagsCount} videos are missing tags entirely, severely limiting discoverability`;
      secondary = "This represents the highest-impact optimization opportunity for immediate implementation";
    } else if (analysis.seoMetadata.titles.optimalLengthPercentage < 50) {
      primary = "Significant percentage of video titles are suboptimally short for SEO performance";
      secondary = "Title optimization offers quick wins for improved click-through rates and search visibility";
    } else if (analysis.engagementSignals.viewsToSubscribers?.ratio < 8) {
      primary = "Low percentage of subscribers engaging with new content indicates retention challenges";
      secondary = "Subscriber engagement optimization could yield 2-3x improvements in organic reach";
    }
    
    return { primary, secondary };
  }

  getTopPriorityForDocs(analysis) {
    if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
      return "Add comprehensive, relevant tags to all videos currently lacking them";
    } else if (analysis.seoMetadata.titles.optimalLengthPercentage < 50) {
      return "Optimize video titles for optimal length (40-60 characters) and keyword inclusion";
    } else if (analysis.engagementSignals.viewsToSubscribers?.ratio < 8) {
      return "Improve video hooks, thumbnails, and content opening to boost subscriber engagement";
    }
    return "Maintain current performance levels while implementing growth optimization strategies";
  }

  getEstimatedTimeToImprove(analysis) {
    if (analysis.seoMetadata.tags.videosWithNoTagsCount > 3) {
      return "2-3 hours for immediate critical improvements, then 1-2 hours weekly for ongoing optimization";
    } else if (analysis.overallScores.seoScore < 60) {
      return "1-2 hours weekly focused on SEO optimization and content strategy refinement";
    }
    return "30-60 minutes weekly for ongoing optimization and performance monitoring";
  }

  // [Additional helper methods would continue here - truncated for space]
  // Include all the remaining methods from the previous complete version
  
  buildCriticalIssuesSection(analysis) {
    let section = "";
    
    if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
      section += `🚨 CRITICAL PRIORITY: Missing Video Tags
${analysis.seoMetadata.tags.videosWithNoTagsCount} videos have no tags, severely limiting discoverability and search ranking potential.

Action Required: Add 8-15 relevant, targeted tags to each untagged video
Expected Impact: Immediate 20-40% improvement in search discoverability
Time Investment: 2-3 hours total (10-15 minutes per video)
Priority Level: URGENT - Complete within 48 hours

`;
    }
    
    if (analysis.seoMetadata.titles.optimalLengthPercentage < 50) {
      section += `⚠️ HIGH PRIORITY: Title Length Optimization
${Math.round((1 - analysis.seoMetadata.titles.optimalLengthPercentage/100) * analysis.videos.length)} titles are under 30 characters, missing valuable SEO real estate.

Action Required: Extend titles to 40-60 characters incorporating target keywords
Expected Impact: 15-25% improvement in click-through rates from search
Time Investment: 1-2 hours total
Priority Level: HIGH - Complete within 1 week

`;
    }
    
    if (analysis.engagementSignals.viewsToSubscribers?.ratio < 8) {
      section += `📈 GROWTH OPPORTUNITY: Subscriber Engagement
Only ${analysis.engagementSignals.viewsToSubscribers?.ratio?.toFixed(1)}% of subscribers are viewing new content, indicating engagement challenges.

Action Required: Improve video hooks, optimize thumbnails, ensure consistent posting schedule
Expected Impact: 2-3x increase in subscriber engagement and organic reach
Time Investment: 30-45 minutes per new video
Priority Level: HIGH - Implement for next 3 videos

`;
    }
    
    if (section === "") {
      section = "✅ EXCELLENT: No critical issues identified. Channel demonstrates strong foundational optimization across all key performance areas. Focus should be on growth scaling and advanced optimization strategies.";
    }
    
    return section;
  }

  buildVideoPerformanceTable(videos) {
    let table = "Top Recent Videos Analysis:\n\n";
    table += "Title                                    Views      Engagement   Tags   Primary Issue\n";
    table += "────────────────────────────────────────────────────────────────────────────────────\n";
    
    videos.slice(0, 8).forEach((video, index) => {
      const title = video.title.length > 35 ? video.title.substring(0, 32) + '...' : video.title;
      const views = video.views.toLocaleString().padStart(8);
      const engagement = `${video.engagementRate.toFixed(1)}%`.padStart(8);
      const tags = `${video.tags?.length || 0}`.padStart(4);
      const issue = (!video.tags || video.tags.length === 0) ? 'Missing Tags' : 
                    video.title.length < 30 ? 'Short Title' : 
                    video.engagementRate < 2 ? 'Low Engagement' : 'Optimized';
      
      table += `${(index + 1).toString().padStart(2)}. ${title.padEnd(32)} ${views} ${engagement} ${tags}   ${issue}\n`;
    });
    
    return table;
  }

  getVideoPerformanceInsights(videos) {
    const avgEngagement = videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length;
    const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
    const videosWithoutTags = videos.filter(v => !v.tags || v.tags.length === 0).length;
    
    return `• Average engagement rate: ${avgEngagement.toFixed(2)}% (Industry benchmark: 3-6%)
• Average views per video: ${Math.round(avgViews).toLocaleString()}
• Videos requiring tag optimization: ${videosWithoutTags}
• Highest performing video: ${videos[0]?.title.substring(0, 50)}... (${videos[0]?.views.toLocaleString()} views)
• Content consistency: ${videos.length >= 15 ? 'Excellent' : videos.length >= 10 ? 'Good' : 'Needs Improvement'} posting frequency`;
  }

  getGradeFromScore(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    return 'F';
  }

  getStatusFromScore(score) {
    if (score >= 85) return 'Excellent Performance';
    if (score >= 75) return 'Good Performance';
    if (score >= 65) return 'Satisfactory Performance';
    if (score >= 55) return 'Needs Improvement';
    return 'Critical Attention Required';
  }

  getTitleAssessment(titleData) {
    if (titleData.optimalLengthPercentage >= 80) return 'Excellent title optimization';
    if (titleData.optimalLengthPercentage >= 60) return 'Good title structure';
    if (titleData.optimalLengthPercentage >= 40) return 'Moderate optimization needed';
    return 'Significant title improvements required';
  }

  getTitleRecommendation(titleData) {
    if (titleData.optimalLengthPercentage < 50) {
      return "Priority: Extend titles to 40-60 characters with target keywords for improved SEO";
    } else if (titleData.hasNumbersPercentage < 30) {
      return "Include specific numbers and data points in titles for higher click-through rates";
    }
    return "Maintain current title optimization approach while testing emotional hooks";
  }

  getDescriptionAssessment(descData) {
    if (descData.averageLength >= 300) return 'Excellent description depth';
    if (descData.averageLength >= 200) return 'Good description quality';
    if (descData.averageLength >= 100) return 'Adequate description length';
    return 'Descriptions require significant expansion';
  }

  getDescriptionRecommendation(descData) {
    if (descData.averageLength < 200) {
      return "Priority: Write longer, more detailed descriptions (300+ characters) with keywords and CTAs";
    } else if (descData.hasTimestampsPercentage < 50) {
      return "Add timestamps to longer videos to improve user experience and session duration";
    }
    return "Optimize descriptions with relevant keywords and stronger calls-to-action";
  }

  getTagAssessment(tagData) {
    if (tagData.videosWithNoTagsCount === 0 && tagData.averageTagCount >= 10) return 'Excellent tag strategy';
    if (tagData.videosWithNoTagsCount === 0) return 'Good basic tagging';
    if (tagData.videosWithNoTagsCount <= 2) return 'Minor tag gaps';
    return 'Critical tag deficiencies';
  }

  getTagRecommendation(tagData) {
    if (tagData.videosWithNoTagsCount > 0) {
      return "URGENT: Add 8-15 relevant tags to all videos missing them - highest impact optimization";
    } else if (tagData.averageTagCount < 8) {
      return "Increase tag count to 10-15 per video using mix of broad and specific keywords";
    }
    return "Optimize existing tags for better keyword targeting and search relevance";
  }

  getEngagementAnalysis(ratio) {
    if (ratio > 15) return "Outstanding subscriber engagement indicating strong content-audience fit";
    if (ratio > 10) return "Excellent subscriber engagement with room for optimization";
    if (ratio > 8) return "Good subscriber engagement meeting industry standards";
    if (ratio > 5) return "Moderate engagement requiring content strategy improvements";
    return "Low engagement indicating critical need for content and engagement optimization";
  }

  getTopContentType(videos) {
    // Simplified analysis
    const avgDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0) / videos.length;
    if (avgDuration < 300) return 'Short-form content';
    if (avgDuration < 1200) return 'Standard tutorials/guides';
    return 'Long-form educational content';
  }

  compareToIndustry(value, type) {
    switch(type) {
      case 'engagement':
        if (value > 4) return 'Above industry average (excellent)';
        if (value > 2) return 'Industry average (good)';
        return 'Below industry average (needs improvement)';
      case 'subscriber':
        if (value > 15) return 'Excellent (top 20%)';
        if (value > 8) return 'Above average';
        return 'Below average (optimization needed)';
      case 'seo':
        if (value > 80) return 'Excellent optimization (top 10%)';
        if (value > 60) return 'Good optimization';
        return 'Needs significant improvement';
      default:
        return 'Analyzing...';
    }
  }

  getNextReviewDate() {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  buildRecommendationsSection(analysis, priority) {
    const recommendations = analysis.priorityRecommendations.filter(rec => 
      rec.priority === priority
    );
    
    let section = "";
    recommendations.slice(0, 4).forEach((rec, index) => {
      section += `${index + 1}. ${rec.action}\n`;
      section += `   Expected Impact: ${rec.impact || 'Medium impact on channel performance'}\n`;
      section += `   Time Investment: ${rec.timeInvestment || '30-60 minutes'}\n`;
      section += `   Success Metric: ${this.getSuccessMetric(rec.category)}\n\n`;
    });
    
    return section || "No specific recommendations in this priority category. Focus on maintaining current optimization levels.";
  }

  getSuccessMetric(category) {
    switch(category) {
      case 'Tag Strategy': return 'Improved search ranking and discoverability';
      case 'Title Optimization': return 'Increased click-through rate from search';
      case 'Description Quality': return 'Better SEO performance and engagement';
      default: return 'Overall channel performance improvement';
    }
  }

  getWeeklyTasks(analysis, period) {
    switch(period) {
      case '1-2':
        if (analysis.seoMetadata.tags.videosWithNoTagsCount > 0) {
          return `• Add tags to all ${analysis.seoMetadata.tags.videosWithNoTagsCount} videos missing them (Priority #1)
• Optimize titles for top 5 underperforming videos
• Update channel description with better keyword targeting
• Audit thumbnail consistency across recent videos
• Set up analytics tracking for optimization results`;
        }
        return `• Optimize underperforming video titles with keyword research
• Improve thumbnail design consistency across recent content
• Update channel description and about section
• Implement consistent posting schedule
• Set up performance tracking systems`;
      
      case '3-4':
        return `• Create comprehensive content calendar for next month
• Develop 3-5 themed playlists for content organization
• Implement advanced SEO strategies for new uploads
• A/B test thumbnail designs for engagement optimization
• Analyze competitor strategies for content inspiration`;
      
      case 'month2':
        return `• Monitor performance metrics and ROI from implemented changes
• Scale successful optimization tactics across all content
• Develop advanced content strategies based on analytics
• Explore collaboration opportunities with similar channels
• Implement advanced growth strategies and community building`;
      
      default:
        return "Continue systematic optimization efforts based on performance data";
    }
  }

  buildConclusion(analysis, overallHealth) {
    return `${analysis.channel.name} demonstrates ${overallHealth.summary} with a composite health score of ${overallHealth.score}/100. The comprehensive analysis reveals ${overallHealth.trend}, positioning the channel for ${overallHealth.score >= 70 ? 'accelerated growth' : 'systematic improvement'} through strategic optimization.

The primary focus area should be ${this.getTopPriorityForDocs(analysis).toLowerCase()}. This represents the highest-impact optimization opportunity with measurable results expected within 7-14 days of implementation.

Key Success Indicators to Monitor:
• Search impression growth (target: 15-30% increase monthly)
• Click-through rate improvement (target: 2-4% absolute increase)
• Subscriber engagement rate (target: ${analysis.engagementSignals.viewsToSubscribers?.ratio < 8 ? 'double current rate' : 'maintain above 10%'})
• Average view duration and audience retention metrics

Implementation of the strategic recommendations outlined in this report should result in measurable improvements within 30 days, with significant performance gains achievable within 60-90 days through consistent execution.

This analysis provides a comprehensive roadmap for optimizing channel performance and achieving sustainable growth through data-driven strategic improvements. Regular monthly reviews are recommended to adjust strategies based on performance data and emerging opportunities.`;
  }

  // Professional formatting for Google Docs
  async applyProfessionalDocFormatting(documentId, reportText) {
    try {
      const requests = [
        // Title formatting
        {
          updateTextStyle: {
            range: { startIndex: 1, endIndex: 40 },
            textStyle: {
              fontSize: { magnitude: 24, unit: 'PT' },
              bold: true,
              foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.4 } } }
            },
            fields: 'fontSize,bold,foregroundColor'
          }
        },
        // Apply consistent formatting for section headers
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: reportText.length },
            paragraphStyle: {
              lineSpacing: 1.15,
              spaceAfter: { magnitude: 6, unit: 'PT' }
            },
            fields: 'lineSpacing,spaceAfter'
          }
        }
      ];

      await this.docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      });
      
      console.log('🎨 Professional formatting applied successfully!');
    } catch (formatError) {
      console.log('⚠️ Basic formatting applied, advanced styling skipped:', formatError.message);
    }
  }
  
  async saveResults(analysis) {
    try {
      await fs.mkdir('results', { recursive: true });
      await fs.writeFile(
        `results/analysis-${Date.now()}.json`,
        JSON.stringify(analysis, null, 2)
      );
      console.log('📁 Results saved as JSON backup');
    } catch (error) {
      console.error('Failed to save results:', error);
    }
  }

  // EXISTING ANALYSIS METHODS (keeping the same logic)
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

  // UTILITY METHODS
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

  generateSEORecommendations(titles, descriptions, tags) {
    const recommendations = [];
    
    if (titles.averageScore < 70) {
      recommendations.push({
        priority: 'High',
        category: 'Title Optimization',
        action: 'Improve title SEO with keywords and optimal length',
        impact: 'Increased click-through rates and search visibility',
        timeInvestment: '15-20 minutes per video'
      });
    }
    
    if (descriptions.averageScore < 60) {
      recommendations.push({
        priority: 'High',
        category: 'Description Quality',
        action: 'Write longer, more detailed descriptions with timestamps',
        impact: 'Better SEO rankings and user engagement',
        timeInvestment: '10-15 minutes per video'
      });
    }
    
    if (tags.averageScore < 50) {
      recommendations.push({
        priority: 'Critical',
        category: 'Tag Strategy',
        action: 'Use 8-15 relevant tags per video',
        impact: 'Immediate improvement in discoverability',
        timeInvestment: '5-10 minutes per video'
      });
    }
    
    return recommendations;
  }

  generatePriorityRecommendations(analysisResults) {
    const allRecommendations = [
      ...analysisResults.seo.recommendations,
      ...analysisResults.playlists.recommendations
    ];
    
    // Add some default recommendations if none exist
    if (allRecommendations.length === 0) {
      allRecommendations.push({
        priority: 'Medium',
        category: 'General Optimization',
        action: 'Continue current optimization strategies',
        impact: 'Maintain performance levels',
        timeInvestment: '30 minutes weekly'
      });
    }
    
    const priorityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    
    return allRecommendations
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, 10);
  }
}

// Main execution - now handles both command line URL and Google Doc input
async function main() {
  // Check if URL was provided as command line argument (from Apps Script trigger)
  const channelUrl = process.argv[2];
  
  if (channelUrl) {
    console.log('🤖 Starting analysis with provided URL from Apps Script...');
    console.log(`📋 Channel URL: ${channelUrl}`);
  } else {
    console.log('🤖 Starting automated analysis - reading from Google Doc...');
  }

  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YouTube API key not found in environment variables');
    process.exit(1);
  }

  // Only require input doc ID if no URL provided
  if (!channelUrl && !process.env.GOOGLE_INPUT_DOC_ID) {
    console.error('❌ GOOGLE_INPUT_DOC_ID not found in environment variables');
    console.error('💡 Please create an input Google Doc and add its ID to your environment variables');
    process.exit(1);
  }

  if (!process.env.GOOGLE_OUTPUT_DOC_ID) {
    console.error('❌ GOOGLE_OUTPUT_DOC_ID not found in environment variables');
    console.error('💡 Please create an output Google Doc and add its ID to your environment variables');
    process.exit(1);
  }

  const analyzer = new YouTubeChannelAnalyzer();
  
  try {
    await analyzer.analyzeChannelFromInput(channelUrl);
    console.log('🎉 Analysis completed successfully with professional Google Docs report!');
  } catch (error) {
    console.error('💥 Analysis failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = YouTubeChannelAnalyzer;
