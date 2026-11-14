//cs_include Scripts/CoreBots.cs
using Skua.Core.Interfaces;
public class Direct2
{
    public IScriptInterface Bot => IScriptInterface.Instance;
    public CoreBots Core => CoreBots.Instance;
    public void ScriptMain(IScriptInterface bot)
    {
        Core.SetOptions();
        Core.EquipClass(ClassType.Solo);
        Core.KillMonster("slime", "r1", "Left", "Slime", "Slime Drop", 5, false);
        Core.SetOptions(false);
    }
}
