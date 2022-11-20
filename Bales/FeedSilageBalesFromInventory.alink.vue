<script setup>
import { ref } from 'vue';
import { useDialogPluginComponent } from 'quasar'

const props = defineProps({
  asset: {
    type: Object,
    required: true,
  },
});

defineEmits([
  ...useDialogPluginComponent.emits
]);

const { dialogRef, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const baleCount = ref(0);

const onSubmit = () => {
  onDialogOK(baleCount.value);
};
</script>

<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="q-dialog-plugin q-gutter-md" style="width: 700px; max-width: 80vw;">
      <h4>How many bales were used?</h4>
      <div class="q-pa-md">
      <q-slider
        v-model="baleCount"
        :min="0"
        :max="20"
        :step="1"
        snap
        label
      />
      <q-input
        v-model.number="baleCount"
        type="number"
        filled
      />
      </div>
      <div class="q-pa-sm q-gutter-sm row justify-end">
        <q-btn color="secondary" label="Cancel" @click="onDialogCancel" />
        <q-btn
          color="primary"
          label="Record"
          @click="onSubmit"
          :disabled="baleCount <= 0"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<script>
import { h } from 'vue';
import { QBtn } from 'quasar';
import { formatRFC3339, summarizeAssetNames, uuidv4 } from "assetlink-plugin-api";

const UNIT_NAME = "bale(s)";

export default {
  async onLoad(handle, assetLink) {
    await assetLink.booted;

    const findUnitTerm = async entitySource => {
      const results = await entitySource.query(q => q
          .findRecords('taxonomy_term--unit')
          .filter({ attribute: 'name', op: 'equal', value: UNIT_NAME }));
      return results.flatMap(l => l).find(a => a);
    };

    let baleUnitTerm = await findUnitTerm(assetLink.entitySource.cache);

    if (!baleUnitTerm) {
      baleUnitTerm = await findUnitTerm(assetLink.entitySource);
    }

    if (!baleUnitTerm) {
      const unitTermToCreate = {
          type: 'taxonomy_term--unit',
          id: uuidv4(),
          attributes: {
            name: UNIT_NAME,
          },
      };

      baleUnitTerm = await assetLink.entitySource.update(
          (t) => t.addRecord(unitTermToCreate),
          {label: `Add '${UNIT_NAME}' unit`});
    }

    handle.defineSlot('com.example.farmos_asset_link.actions.v0.deccrement_bale_inventory', action => {
      action.type('asset-action');

      action.showIf(({ asset }) => asset.attributes.status !== 'archived'
          // TODO: Implement a better predicate here...
          && asset.attributes.name.toLowerCase().indexOf("silage bales") !== -1);

      const doActionWorkflow = async (asset) => {
        const baleCount = await assetLink.ui.dialog.custom(handle.thisPlugin, { asset });

        if (!baleCount || baleCount <= 0) {
          return;
        }

        const baleQuantity = {
          type: 'quantity--material',
          id: uuidv4(),
          attributes: {
            measure: 'count',
            value: {
              numerator: baleCount,
              denominator: 1,
              decimal: `${baleCount}`,
            },
            inventory_adjustment: 'decrement',
          },
          relationships: {
            inventory_asset: {
              data: {
                  type: asset.type,
                  id: asset.id,
                }
            },
            units: {
              data: {
                type: baleUnitTerm.type,
                id: baleUnitTerm.id,
              }
            },
          },
        };

        const harvestLog = {
          type: 'log--harvest',
          attributes: {
            name: `Fed ${baleCount} bale(s)`,
            timestamp: formatRFC3339(new Date()),
            status: "done",
          },
          relationships: {
            asset: {
              data: [
                {
                  type: asset.type,
                  id: asset.id,
                }
              ]
            },
            quantity: {
              data: [
                {
                  type: baleQuantity.type,
                  id: baleQuantity.id,
                }
              ]
            },
          },
        };

        assetLink.entitySource.update(
            (t) => [
              t.addRecord(baleQuantity),
              t.addRecord(harvestLog),
            ],
            {label: `Feed bales`});
      };

      action.component(({ asset }) =>
        h(QBtn, { block: true, color: 'secondary', onClick: () => doActionWorkflow(asset), 'no-caps': true },  "Feed Bales" ));
    });
  }
}
</script>
