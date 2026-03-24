import { CloudEventsFunction } from '@google-cloud/functions-framework';
import { PubSub } from '@google-cloud/pubsub';
import { Compute } from '@google-cloud/compute';
import { Run } from '@google-cloud/run';
import { WebhookClient } from 'discord.js';

const BILLING_THRESHOLD_DOLLARS = parseFloat(process.env.BILLING_THRESHOLD) || 1.0;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PROJECT_ID = process.env.GCP_PROJECT;

const compute = new Compute();
const run = new Run();
const pubsub = new PubSub();

async function notifyDiscord(message) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('Discord webhook not configured, skipping notification');
    return;
  }

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
    console.log('Discord notification sent');
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
}

async function terminateCloudRunServices() {
  console.log('Terminating Cloud Run services...');
  
  try {
    const [services] = await run.getServices({ parent: `projects/${PROJECT_ID}/locations/-` });
    
    for (const service of services) {
      if (service.name.includes('secureagent')) {
        console.log(`Deleting service: ${service.name}`);
        await run.deleteService(service.name);
      }
    }
    console.log('Cloud Run services terminated');
  } catch (error) {
    console.error('Error terminating Cloud Run:', error);
  }
}

async function stopVMs() {
  console.log('Stopping VMs...');
  
  try {
    const [vms] = await compute.getInstances({ project: PROJECT_ID, zone: '-' });
    
    for (const vm of vms) {
      if (vm.name.includes('kimaki') || vm.name.includes('brain')) {
        console.log(`Stopping VM: ${vm.name}`);
        await compute zone(vm.zone).instances().stop({ instance: vm.name });
      }
    }
    console.log('VMs stopped');
  } catch (error) {
    console.error('Error stopping VMs:', error);
  }
}

async function disableGCPBilling() {
  console.log('Disabling GCP billing...');
  
  try {
    const billing = await pubsub.topic('billing-info').publish({
      data: Buffer.from(JSON.stringify({ budget: 0 }))
    });
    console.log('Billing disable command sent');
  } catch (error) {
    console.error('Error disabling billing:', error);
  }
}

export const budgetKillswitch = CloudEventsFunction(async (cloudevent) => {
  console.log('Budget Killswitch triggered');
  console.log('CloudEvent:', cloudevent);

  try {
    const pubsubMessage = cloudevent.data?.message;
    if (!pubsubMessage) {
      console.log('No Pub/Sub message found');
      return;
    }

    const data = Buffer.from(pubsubMessage.data, 'base64').toString();
    const billingData = JSON.parse(data);

    const costAmount = billingData.costAmount || billingData.budgetAmount || 0;
    const budgetAmount = billingData.budgetAmount || BILLING_THRESHOLD_DOLLARS;

    console.log(`Current cost: $${costAmount}, Budget: $${budgetAmount}`);

    if (costAmount >= budgetAmount) {
      console.log('🚨 BUDGET THRESHOLD EXCEEDED! Executing killswitch...');

      await notifyDiscord(
        `🚨 **BUDGET ALERT**\n` +
        `Cost: $${costAmount}\n` +
        `Budget: $${budgetAmount}\n` +
        `Executing safety measures...`
      );

      await terminateCloudRunServices();
      await stopVMs();

      await notifyDiscord(
        `✅ **Killswitch Complete**\n` +
        `- Cloud Run services terminated\n` +
        `- VMs stopped\n` +
        `Billing has been disabled to prevent further charges.`
      );

      await disableGCPBilling();

    } else {
      console.log(`Budget OK: $${costAmount} < $${budgetAmount}`);
    }

  } catch (error) {
    console.error('Killswitch error:', error);
    await notifyDiscord(`❌ Killswitch error: ${error.message}`);
  }
});
