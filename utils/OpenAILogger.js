const fs = require('fs');
const path = require('path');

class OpenAILogger {
  constructor() {
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.openaiLogFile = path.join(this.logsDir, 'openai.log');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  formatLogEntry(type, operation, input, output, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      operation,
      metadata: {
        model: metadata.model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        userId: metadata.userId || 'unknown',
        ...metadata
      },
      input,
      output,
      separator: '='.repeat(80)
    };

    return JSON.stringify(logEntry, null, 2) + '\n' + '='.repeat(80) + '\n\n';
  }

  async logOpenAICall(operation, input, output, metadata = {}) {
    try {
      // Enhanced console logging for immediate visibility
      this.logToConsoleDetailed('openai_call', operation, input, output, metadata);

      // File logging for persistence
      const logEntry = this.formatLogEntry('openai_call', operation, input, output, metadata);
      
      fs.appendFile(this.openaiLogFile, logEntry, (err) => {
        if (err) {
          console.error('Failed to write OpenAI log to file:', err);
        }
      });

    } catch (error) {
      console.error('Error in OpenAI logging:', error);
    }
  }

  async logOpenAIError(operation, input, error, metadata = {}) {
    try {
      // Enhanced console error logging
      console.log('\n' + '❌'.repeat(30));
      console.log(`� TIME: ${new Date().toISOString()}`);
      console.log(`🚨 ERROR OPERATION: ${operation}`);
      console.log(`👤 USER: ${metadata.userId || 'unknown'}`);
      console.log('❌'.repeat(30));
      
      console.log('\n📝 INPUT THAT CAUSED ERROR:');
      console.log(JSON.stringify(input, null, 2));
      
      console.log('\n🚨 ERROR DETAILS:');
      console.log(`Message: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
      if (error.response?.data) {
        console.log('API Response:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.response?.status) {
        console.log(`HTTP Status: ${error.response.status}`);
      }
      
      console.log('\n' + '❌'.repeat(30) + '\n');

      // File logging
      const logEntry = this.formatLogEntry('openai_error', operation, input, {
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      }, metadata);
      
      fs.appendFile(this.openaiLogFile, logEntry, (err) => {
        if (err) {
          console.error('Failed to write OpenAI error log to file:', err);
        }
      });

    } catch (logError) {
      console.error('Error in OpenAI error logging:', logError);
    }
  }

  // Helper method to wrap OpenAI calls with logging
  async loggedOpenAICall(openai, operation, params, metadata = {}) {
    const startTime = Date.now();
    
    try {
      // Log the input
      const input = {
        operation: 'chat.completions.create',
        model: params.model,
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        ...params
      };

      console.log(`\n🚀 Starting OpenAI ${operation}...`);
      
      const response = await openai.chat.completions.create(params);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Log the output
      const output = {
        response: {
          id: response.id,
          model: response.model,
          choices: response.choices,
          usage: response.usage,
          created: response.created
        },
        duration_ms: duration
      };

      await this.logOpenAICall(operation, input, output, {
        ...metadata,
        duration_ms: duration,
        usage: response.usage
      });

      return response;

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      await this.logOpenAIError(operation, {
        operation: 'chat.completions.create',
        model: params.model,
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        ...params
      }, error, {
        ...metadata,
        duration_ms: duration
      });

      throw error;
    }
  }

  // Method to get recent logs for debugging
  getRecentLogs(lines = 50) {
    try {
      if (!fs.existsSync(this.openaiLogFile)) {
        return 'No OpenAI logs found.';
      }

      const data = fs.readFileSync(this.openaiLogFile, 'utf8');
      const logLines = data.split('\n');
      return logLines.slice(-lines).join('\n');
    } catch (error) {
      console.error('Error reading OpenAI logs:', error);
      return 'Error reading logs.';
    }
  }

  // Method to clear old logs
  clearOldLogs(daysToKeep = 7) {
    try {
      if (!fs.existsSync(this.openaiLogFile)) {
        return;
      }

      const stats = fs.statSync(this.openaiLogFile);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > daysToKeep) {
        fs.unlinkSync(this.openaiLogFile);
        console.log(`Cleared OpenAI logs older than ${daysToKeep} days`);
      }
    } catch (error) {
      console.error('Error clearing old OpenAI logs:', error);
    }
  }

  // Enhanced console logging method
  logToConsoleDetailed(type, operation, input, output, metadata = {}) {
    const timestamp = new Date().toISOString();
    const modelInfo = metadata.model || input.model || 'unknown';
    const usage = metadata.usage || output.usage;

    // Header with timestamp and operation
    console.log('\n' + '🤖'.repeat(30));
    console.log(`🕒 TIME: ${timestamp}`);
    console.log(`⚡ OPERATION: ${operation}`);
    console.log(`🧠 MODEL: ${modelInfo}`);
    if (metadata.userId) {
      console.log(`👤 USER: ${metadata.userId}`);
    }
    console.log('🤖'.repeat(30));

    // Input section with syntax highlighting
    console.log('\n📝 INPUT DETAILS:');
    console.log('┌─ Model Configuration:');
    console.log(`│  Model: ${input.model || 'not specified'}`);
    console.log(`│  Max Tokens: ${input.max_tokens || 'not specified'}`);
    console.log(`│  Temperature: ${input.temperature || 'not specified'}`);
    console.log('└─');
    
    console.log('\n┌─ Messages:');
    if (input.messages) {
      input.messages.forEach((msg, index) => {
        console.log(`│  [${index + 1}] Role: ${msg.role}`);
        console.log(`│      Content: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
      });
    }
    console.log('└─');

    // Full input JSON for debugging
    console.log('\n🔍 FULL INPUT JSON:');
    console.log(JSON.stringify(input, null, 2));

    // Output section
    console.log('\n📤 OUTPUT DETAILS:');
    if (output.choices && output.choices.length > 0) {
      console.log('┌─ Response:');
      output.choices.forEach((choice, index) => {
        console.log(`│  [${index + 1}] Finish Reason: ${choice.finish_reason || 'unknown'}`);
        console.log(`│      Content: ${choice.message?.content?.substring(0, 300) || 'no content'}${choice.message?.content?.length > 300 ? '...' : ''}`);
      });
      console.log('└─');
    }

    // Usage and performance metrics
    if (usage) {
      console.log('\n📊 USAGE STATISTICS:');
      console.log('┌─ Token Usage:');
      console.log(`│  Prompt Tokens: ${usage.prompt_tokens || 0}`);
      console.log(`│  Completion Tokens: ${usage.completion_tokens || 0}`);
      console.log(`│  Total Tokens: ${usage.total_tokens || 0}`);
      console.log('└─');
    }

    if (metadata.duration_ms) {
      console.log('\n⏱️  PERFORMANCE:');
      console.log(`   Duration: ${metadata.duration_ms}ms`);
      console.log(`   Tokens/sec: ${usage?.total_tokens ? Math.round(usage.total_tokens / (metadata.duration_ms / 1000)) : 'N/A'}`);
    }

    // Full output JSON for debugging
    console.log('\n🔍 FULL OUTPUT JSON:');
    console.log(JSON.stringify(output, null, 2));

    console.log('\n' + '🤖'.repeat(30) + '\n');
  }

  // Method to get structured log data for API consumption
  getStructuredLogs(maxEntries = 50) {
    try {
      if (!fs.existsSync(this.openaiLogFile)) {
        return { logs: [], total: 0 };
      }

      const data = fs.readFileSync(this.openaiLogFile, 'utf8');
      const logEntries = data.split('='.repeat(80) + '\n\n')
        .filter(entry => entry.trim())
        .slice(-maxEntries);

      const parsedLogs = logEntries.map((entry, index) => {
        try {
          return JSON.parse(entry);
        } catch (parseError) {
          return {
            timestamp: new Date().toISOString(),
            type: 'parse_error',
            raw: entry.substring(0, 200) + '...',
            index
          };
        }
      });

      return {
        logs: parsedLogs.reverse(), // Most recent first
        total: parsedLogs.length
      };
    } catch (error) {
      console.error('Error reading structured logs:', error);
      return { logs: [], total: 0, error: error.message };
    }
  }

  // Method to watch for real-time logs (for development)
  watchLogs(callback) {
    if (!fs.existsSync(this.openaiLogFile)) {
      return null;
    }

    try {
      const watcher = fs.watchFile(this.openaiLogFile, (current, previous) => {
        if (current.mtime > previous.mtime) {
          const recentLogs = this.getStructuredLogs(5);
          callback(recentLogs);
        }
      });
      return watcher;
    } catch (error) {
      console.error('Error setting up log watcher:', error);
      return null;
    }
  }

  // Method to analyze log patterns (for debugging and optimization)
  analyzeLogPatterns() {
    try {
      const { logs } = this.getStructuredLogs(100);
      
      const analysis = {
        totalCalls: logs.length,
        successfulCalls: logs.filter(log => log.type === 'openai_call').length,
        errorCalls: logs.filter(log => log.type === 'openai_error').length,
        operationCounts: {},
        modelUsage: {},
        averageResponseTime: 0,
        totalTokens: 0,
        costEstimate: 0
      };

      let totalDuration = 0;
      let durationsCount = 0;

      logs.forEach(log => {
        // Count operations
        if (log.operation) {
          analysis.operationCounts[log.operation] = (analysis.operationCounts[log.operation] || 0) + 1;
        }

        // Count model usage
        const model = log.metadata?.model || log.input?.model;
        if (model) {
          analysis.modelUsage[model] = (analysis.modelUsage[model] || 0) + 1;
        }

        // Calculate average response time
        if (log.metadata?.duration_ms) {
          totalDuration += log.metadata.duration_ms;
          durationsCount++;
        }

        // Sum tokens for cost estimation
        if (log.metadata?.usage?.total_tokens) {
          analysis.totalTokens += log.metadata.usage.total_tokens;
        }
      });

      if (durationsCount > 0) {
        analysis.averageResponseTime = Math.round(totalDuration / durationsCount);
      }

      // Rough cost estimate (assuming GPT-3.5-turbo pricing)
      analysis.costEstimate = (analysis.totalTokens / 1000) * 0.002; // $0.002 per 1K tokens

      return analysis;
    } catch (error) {
      console.error('Error analyzing log patterns:', error);
      return null;
    }
  }
}

module.exports = new OpenAILogger();
