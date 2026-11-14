package chat.agentes.appicon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app icon a person picks (ADR 0179). Android has no call for it: the launcher's entry is one `activity-alias`
 * of the main activity per icon, `<package>.AppIcon<Id>` (plugins/with-app-icons.js), and only the picked one is on.
 * `names` are those aliases (the first is the one the app ships with). Launchers redraw in their own time, and some
 * close the app while they do, whatever DONT_KILL_APP asks.
 */
class AppIconModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun component(name: String) = ComponentName(context.packageName, "${context.packageName}.$name")

  override fun definition() = ModuleDefinition {
    Name("AppIcon")

    // A build from before the aliases has none.
    AsyncFunction("supported") { names: List<String> ->
      val first = names.firstOrNull() ?: return@AsyncFunction false
      try {
        context.packageManager.getActivityInfo(component(first), PackageManager.MATCH_DISABLED_COMPONENTS)
        true
      } catch (_: PackageManager.NameNotFoundException) {
        false
      }
    }

    // The alias turned on; none turned on by hand means the manifest's own, the first.
    AsyncFunction("get") { names: List<String> ->
      val pm = context.packageManager
      names.firstOrNull { pm.getComponentEnabledSetting(component(it)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED }
        ?: names.firstOrNull()
    }

    // The picked alias on first, then the others off, so the launcher never has none.
    AsyncFunction("set") { names: List<String>, name: String? ->
      val picked = name ?: names.firstOrNull() ?: return@AsyncFunction
      require(picked in names) { "unknown icon" }
      val pm = context.packageManager
      pm.setComponentEnabledSetting(
        component(picked),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP,
      )
      // Only what is on is turned off (the first is on by the manifest, with no setting of its own): with the
      // icons a person makes there are hundreds of entries, and each change is a call to the system.
      for ((i, other) in names.withIndex()) {
        if (other == picked) continue
        val state = pm.getComponentEnabledSetting(component(other))
        val on = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
          (i == 0 && state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)
        if (!on) continue
        pm.setComponentEnabledSetting(
          component(other),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
      }
    }
  }
}
